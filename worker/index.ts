import http from 'node:http'
import { Queue } from 'bullmq'
import { createOutboxWorker } from './queues/outbox'
import { createRemindersWorker, enqueueOverdueReminders } from './queues/reminders'
import { createReconciliationWorker } from './queues/reconciliation'
import { supabaseAdmin } from './src/lib/billzo/supabase-admin'
import { startBaileysSocket } from './lib/baileys-socket'
import { sendPushNotification } from './src/lib/billzo/notifications'
import { createRedisConnection } from './lib/redis'
import { logWorkerEvent, logWorkerError } from './lib/logging'

async function getQueueHealth() {
  const connection = createRedisConnection()
  try {
    const [outboxCounts, reminderCounts, reconCounts] = await Promise.all([
      new Queue('outbox', { connection }).getJobCounts().catch(() => ({})),
      new Queue('reminders', { connection }).getJobCounts().catch(() => ({})),
      new Queue('reconciliation', { connection }).getJobCounts().catch(() => ({})),
    ])
    return { outbox: outboxCounts, reminders: reminderCounts, reconciliation: reconCounts }
  } finally {
    connection.disconnect()
  }
}

function startHealthServer() {
  const port = parseInt(process.env.PORT || '10000', 10)
  const server = http.createServer(async (req, res) => {
    if (req.url === '/health') {
      try {
        const queueHealth = await getQueueHealth()
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          status: 'ok',
          queues: queueHealth,
          uptime: process.uptime(),
          timestamp: new Date().toISOString(),
        }))
      } catch {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ status: 'ok' }))
      }
    } else {
      res.writeHead(200)
      res.end('BillZo Worker')
    }
  })
  server.listen(port, () => {
    console.log(`[Worker] Health server listening on port ${port}`)
  })
  return server
}

async function main() {
  logWorkerEvent({ message: 'Starting BillZo worker service...', level: 'info', timestamp: new Date().toISOString() })

  if (!process.env.UPSTASH_REDIS_URL) {
    logWorkerError(new Error('Missing UPSTASH_REDIS_URL'), { hint: 'Format: rediss://default:TOKEN@HOST:PORT' })
    process.exit(1)
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    logWorkerError(new Error('Missing SUPABASE_SERVICE_ROLE_KEY'))
    process.exit(1)
  }

  logWorkerEvent({ message: 'Worker config loaded', level: 'info', timestamp: new Date().toISOString(), metadata: { redis: process.env.UPSTASH_REDIS_URL?.slice(0, 20) + '...', supabase: process.env.NEXT_PUBLIC_SUPABASE_URL || 'not set' } })

  const healthServer = startHealthServer()

  const outboxWorker = createOutboxWorker()
  const remindersWorker = createRemindersWorker()
  const reconciliationWorker = createReconciliationWorker()

  logWorkerEvent({ message: 'All workers started', level: 'info', timestamp: new Date().toISOString() })

  // Start Baileys sockets for tenants with Baileys WhatsApp provider
  supabaseAdmin.from('tenants').select('id, whatsapp_config').then(({ data: tenants }) => {
    if (tenants) {
      for (const t of tenants) {
        const cfg = (t.whatsapp_config || {}) as Record<string, any>
        if (cfg.whatsappProvider === 'baileys') {
          console.log(`[Worker] Starting Baileys socket for tenant ${t.id}`)
          startBaileysSocket(t.id).catch((err) =>
            console.error(`[Worker] Failed to start Baileys for ${t.id}:`, err)
          )
        }
      }
    }
  })

  // Scan for overdue invoices every 5 minutes and enqueue reminder jobs
  const enqueueOverdue = async () => {
    try {
      const count = await enqueueOverdueReminders()
      if (count > 0) console.log(`[Worker] Enqueued ${count} overdue reminder jobs`)
    } catch (err) {
      console.error('[Worker] Failed to enqueue overdue reminders:', err)
    }
  }
  enqueueOverdue()
  const overdueInterval = setInterval(enqueueOverdue, 5 * 60 * 1000)

  // Compute merchant reputation daily
  const computeReputation = async () => {
    try {
      const { data: tenants } = await supabaseAdmin.from('tenants').select('id').limit(500)
      if (!tenants) return

      for (const t of tenants) {
        try {
          const { data: events } = await supabaseAdmin
            .from('whatsapp_events')
            .select('status')
            .eq('tenant_id', t.id)
            .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())

          if (!events || events.length === 0) continue

          const total = events.length
          const delivered = events.filter((e: any) => e.status === 'delivered' || e.status === 'read').length
          const failed = events.filter((e: any) => e.status === 'failed').length
          const replied = events.filter((e: any) => e.status === 'read' || e.status === 'clicked_upi').length

          const replyRate = total > 0 ? replied / total : 0
          const failureRate = total > 0 ? failed / total : 0
          const deliveryRate = total > 0 ? delivered / total : 0
          const volumeScore = Math.min(total / 500, 1)

          const reputation =
            replyRate * 0.30 +
            deliveryRate * 0.25 +
            (1 - failureRate) * 0.25 +
            (1 - volumeScore) * 0.20

          await supabaseAdmin
            .from('tenants')
            .update({ whatsapp_reputation: Math.round(reputation * 100) / 100 })
            .eq('id', t.id)

          if (reputation < 0.1) {
            logWorkerEvent({ message: `Reputation critical for tenant ${t.id}, pausing sends`, level: 'warn', timestamp: new Date().toISOString(), tenant_id: t.id })
            await sendPushNotification({
              tenantId: t.id,
              title: 'WhatsApp Reputation Critical',
              body: 'Your WhatsApp sending has been paused due to delivery quality issues. Contact support.',
              type: 'reputation_alert',
              url: '/settings/whatsapp',
            }).catch(() => {})
          }
        } catch (err) {
          logWorkerError(err instanceof Error ? err : new Error(String(err)), { tenant_id: t.id, context: 'reputation_computation' })
        }
      }
      logWorkerEvent({ message: 'Reputation computation completed', level: 'info', timestamp: new Date().toISOString() })
    } catch (err) {
      logWorkerError(err instanceof Error ? err : new Error(String(err)), { context: 'reputation_computation_top_level' })
    }
  }

  computeReputation()
  const reputationInterval = setInterval(computeReputation, 60 * 60 * 1000)

  const shutdown = async () => {
    console.log('[Worker] Shutting down...')
    clearInterval(overdueInterval)
    clearInterval(reputationInterval)
    healthServer.close()
    await Promise.all([
      outboxWorker.close(),
      remindersWorker.close(),
      reconciliationWorker.close(),
    ])
    console.log('[Worker] All workers closed')
    process.exit(0)
  }

  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)

  process.stdin.resume()
}

main().catch((err) => {
  console.error('[Worker] Fatal error:', err)
  process.exit(1)
})
