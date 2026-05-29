import http from 'node:http'
import { Queue } from 'bullmq'
import { createOutboxWorker } from './queues/outbox'
import { createRemindersWorker, enqueueOverdueReminders } from './queues/reminders'
import { createReconciliationWorker } from './queues/reconciliation'
import { createCognitionWorker, enqueueCognitionJobs } from './queues/cognition'
import { createRetryWorker, enqueueDeadLetterRetries } from './queues/retry'
import { supabaseAdmin } from './src/lib/billzo/supabase-admin'
import { startBaileysSocket } from './lib/baileys-socket'
import { sendPushNotification } from './src/lib/billzo/notifications'
import { createRedisConnection } from './lib/redis'
import { logWorkerEvent, logWorkerError } from './lib/logging'
import { AuthorityRuntime } from './src/lib/authority/authority-runtime'
import { invoiceCapabilities } from './src/lib/authority/invoice-capabilities'
import { tenantCapabilities } from './src/lib/authority/tenant-capabilities'
import { reconciliationCapabilities } from './src/lib/authority/reconciliation-capabilities'
import { recoveryCapabilities } from './src/lib/authority/recovery-capabilities'
import { gstrCapabilities } from './src/lib/authority/gstr-capabilities'
import { MutationGate } from './src/lib/mutation-gate'
import { TransportRegistry, BaileysAdapter, GupshupAdapter, SimulationAdapter } from './src/lib/transport'
import { setTransportRegistry } from './lib/whatsapp-router'

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

function startHealthServer(runtime: AuthorityRuntime) {
  const port = parseInt(process.env.PORT || '10000', 10)
  const server = http.createServer(async (req, res) => {
    if (req.url === '/health') {
      try {
        const queueHealth = await getQueueHealth()
        const report = runtime.assertOperational()
        res.writeHead(report.operational ? 200 : 503, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          status: report.operational ? 'ok' : 'degraded',
          phase: report.phase,
          checks: report.checks,
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

  logWorkerEvent({
    message: 'Worker config loaded',
    level: 'info',
    timestamp: new Date().toISOString(),
    metadata: {
      redis: process.env.UPSTASH_REDIS_URL?.slice(0, 20) + '...',
      supabase: process.env.NEXT_PUBLIC_SUPABASE_URL || 'not set',
    },
  })

  // ---- PHASE 1-3: Authority initialization (policy, capabilities, core) ----
  const runtime = new AuthorityRuntime()
  await runtime.initialize({
    supabaseAdmin: supabaseAdmin as any,
    redisRateLimitStore: null,
    tenantPlanLookup: async (tenantId: string) => {
      const { data } = await supabaseAdmin.from('tenants').select('plan').eq('id', tenantId).single()
      return data?.plan ?? undefined
    },
    capabilityProviders: [
      ...invoiceCapabilities,
      ...tenantCapabilities,
      ...reconciliationCapabilities,
      ...recoveryCapabilities,
      ...gstrCapabilities,
    ],
    requiredCapabilities: [],
    bootstrapCreatedBy: 'worker',
    databaseUrl: process.env.AUTHORITY_DATABASE_URL,
  })
  console.log(`[Worker] Authority initialized — phase: ${runtime.orchestrator.currentPhase}`)

  // ---- MutationGate: shadow-mode observability layer (Step 1) ----
  const mutationGate = new MutationGate({ mode: 'shadow' })

  // ---- TransportRegistry: normalized channel abstraction ----
  const transportRegistry = new TransportRegistry()
  transportRegistry.register(new BaileysAdapter())
  transportRegistry.register(new GupshupAdapter())
  transportRegistry.register(new SimulationAdapter())
  setTransportRegistry(transportRegistry)

  function wrapWithGate(client: { submit: Function }): { submit: Function } {
    const origSubmit = client.submit.bind(client)
    return {
      submit: async (intent: any, mode: string) => {
        const result = await origSubmit(intent, mode)
        mutationGate.submit({
          idempotencyKey: intent.nonce ?? `${intent.intentType}:${intent.tenantId}:${Date.now()}`,
          intentType: `${intent.intentType}.v1`,
          tenantId: intent.tenantId,
          entityType: intent.payload?.invoiceId ? 'invoice' : intent.payload?.customerId ? 'customer' : undefined,
          entityId: intent.payload?.invoiceId ?? intent.payload?.customerId ?? undefined,
          payload: intent.payload ?? {},
          mode: 'sync',
        }).catch((err: any) => console.warn('[mutation-gate] Shadow execution failed:', err.message))
        return result
      },
    }
  }

  const gatedClient = wrapWithGate(runtime.internalClient)

  // ---- Health server (safe before queues, reports runtime phase) ----
  const healthServer = startHealthServer(runtime)

  // ---- Queue workers (start AFTER authority core is ready) ----
  const outboxWorker = createOutboxWorker(gatedClient)
  const remindersWorker = createRemindersWorker(gatedClient)
  const reconciliationWorker = createReconciliationWorker(gatedClient)
  const cognitionWorker = createCognitionWorker()
  const retryWorker = createRetryWorker()
  logWorkerEvent({ message: 'All queue workers started', level: 'info', timestamp: new Date().toISOString() })

  // ---- PHASE 4-6: Authority activation (queues → gateway → readiness → RUNNING) ----
  // Gateway on port 3001 starts LAST — after all queue consumers exist.
  await runtime.activate({
    supabaseAdmin: supabaseAdmin as any,
    redisRateLimitStore: null,
    tenantPlanLookup: async () => undefined,
    capabilityProviders: [],
    requiredCapabilities: [],
    bootstrapCreatedBy: 'worker',
  })
  console.log(`[Worker] Authority activated — phase: ${runtime.orchestrator.currentPhase}`)

  // Start Baileys sockets for tenants with Baileys WhatsApp provider
  supabaseAdmin.from('tenants').select('id, whatsapp_config').then(({ data: tenants }) => {
    if (tenants) {
      for (const t of tenants) {
        const cfg = (t.whatsapp_config || {}) as Record<string, any>
        if (cfg.whatsappProvider === 'baileys') {
          console.log(`[Worker] Starting Baileys socket for tenant ${t.id}`)
          startBaileysSocket(t.id).catch((err) =>
            console.error(`[Worker] Failed to start Baileys for ${t.id}:`, err),
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

  // Cognition pipeline — compute operational situations every 10 minutes
  const enqueueCognition = async () => {
    try {
      const count = await enqueueCognitionJobs()
      if (count > 0) console.log(`[Worker] Enqueued ${count} cognition jobs`)
    } catch (err) {
      console.error('[Worker] Failed to enqueue cognition jobs:', err)
    }
  }
  enqueueCognition()
  const cognitionInterval = setInterval(enqueueCognition, 10 * 60 * 1000)

  // Health probe — check all active messaging channels every 5 minutes
  const probeChannelHealth = async () => {
    try {
      const { data: channels } = await supabaseAdmin
        .from('messaging_channels')
        .select('id, provider, connection_state, consecutive_failures')
        .eq('is_active', true)
        .limit(100)

      if (!channels) return

      for (const ch of channels) {
        try {
          const health = await transportRegistry.getHealth(ch.id)
          if (!health) continue

          const newState = health.connectionState
          const consecutiveFailures = newState === 'disconnected' || newState === 'degraded'
            ? (ch.consecutive_failures || 0) + 1
            : 0

          await supabaseAdmin
            .from('messaging_channels')
            .update({
              connection_state: newState,
              last_health_check_at: new Date().toISOString(),
              last_heartbeat_at: health.lastHeartbeatAt,
              consecutive_failures: consecutiveFailures,
              delivery_success_rate: health.deliverySuccessRate,
              quality_score: health.qualityScore,
            })
            .eq('id', ch.id)

          if (consecutiveFailures >= 3 && ch.consecutive_failures < 3) {
            logWorkerEvent({
              message: `Channel ${ch.id} degraded for ${consecutiveFailures} consecutive probes`,
              level: 'warn',
              timestamp: new Date().toISOString(),
              channel_id: ch.id,
              provider: ch.provider,
            })
            await sendPushNotification({
              tenantId: ch.id.split('_')[0],
              title: 'WhatsApp Channel Degraded',
              body: `Your ${ch.provider} channel has been offline for ${consecutiveFailures} checks. Check your connection.`,
              type: 'channel_alert',
              url: '/settings/whatsapp',
            }).catch(() => {})
          }
        } catch (err) {
          logWorkerError(err instanceof Error ? err : new Error(String(err)), {
            channel_id: ch.id,
            context: 'health_probe',
          })
        }
      }
    } catch (err) {
      logWorkerError(err instanceof Error ? err : new Error(String(err)), {
        context: 'health_probe_top_level',
      })
    }
  }
  probeChannelHealth()
  const healthProbeInterval = setInterval(probeChannelHealth, 5 * 60 * 1000)

  // Dead letter retry — recover events that exhausted retries
  const recoverDeadLetters = async () => {
    try {
      const count = await enqueueDeadLetterRetries()
      if (count > 0) console.log(`[Worker] Enqueued ${count} dead letter events for retry`)
    } catch (err) {
      console.error('[Worker] Failed to enqueue dead letter retries:', err)
    }
  }
  recoverDeadLetters()
  const deadLetterInterval = setInterval(recoverDeadLetters, 5 * 60 * 1000)

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

          await gatedClient.submit({
            intentType: 'tenant.update_operational_health',
            intentVersion: 1,
            tenantId: t.id,
            actor: 'system:worker',
            payload: { whatsappReputation: Math.round(reputation * 100) / 100 },
          }, 'trusted_sync')

          if (reputation < 0.1) {
            logWorkerEvent({
              message: `Reputation critical for tenant ${t.id}, pausing sends`,
              level: 'warn',
              timestamp: new Date().toISOString(),
              tenant_id: t.id,
            })
            await sendPushNotification({
              tenantId: t.id,
              title: 'WhatsApp Reputation Critical',
              body: 'Your WhatsApp sending has been paused due to delivery quality issues. Contact support.',
              type: 'reputation_alert',
              url: '/settings/whatsapp',
            }).catch(() => {})
          }
        } catch (err) {
          logWorkerError(err instanceof Error ? err : new Error(String(err)), {
            tenant_id: t.id,
            context: 'reputation_computation',
          })
        }
      }
      logWorkerEvent({
        message: 'Reputation computation completed',
        level: 'info',
        timestamp: new Date().toISOString(),
      })
    } catch (err) {
      logWorkerError(err instanceof Error ? err : new Error(String(err)), {
        context: 'reputation_computation_top_level',
      })
    }
  }

  computeReputation()
  const reputationInterval = setInterval(computeReputation, 60 * 60 * 1000)

  const shutdown = async () => {
    console.log('[Worker] Shutting down...')
    clearInterval(overdueInterval)
    clearInterval(cognitionInterval)
    clearInterval(healthProbeInterval)
    clearInterval(deadLetterInterval)
    clearInterval(reputationInterval)

    // Shutdown authority gateway first (stop accepting new intents)
    await runtime.shutdown()

    // Then stop queue consumers
    healthServer.close()
    await Promise.all([
      outboxWorker.close(),
      remindersWorker.close(),
      reconciliationWorker.close(),
      cognitionWorker.close(),
      retryWorker.close(),
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
