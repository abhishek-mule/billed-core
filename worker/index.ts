import http from 'node:http'
import { createOutboxWorker } from './queues/outbox'
import { createRemindersWorker, enqueueOverdueReminders } from './queues/reminders'
import { createReconciliationWorker } from './queues/reconciliation'
import { supabaseAdmin } from './src/lib/billzo/supabase-admin'
import { startBaileysSocket } from './lib/baileys-socket'

function startHealthServer() {
  const port = parseInt(process.env.PORT || '10000', 10)
  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ status: 'ok' }))
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
  console.log('[Worker] Starting BillZo worker service...')

  if (!process.env.UPSTASH_REDIS_URL) {
    console.error('[Worker] Missing UPSTASH_REDIS_URL')
    console.error('[Worker] Format: rediss://default:TOKEN@HOST:PORT')
    process.exit(1)
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[Worker] Missing SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  console.log('[Worker] Redis:', process.env.UPSTASH_REDIS_URL?.slice(0, 20) + '...')
  console.log('[Worker] Supabase:', process.env.NEXT_PUBLIC_SUPABASE_URL || 'not set')

  const healthServer = startHealthServer()

  const outboxWorker = createOutboxWorker()
  const remindersWorker = createRemindersWorker()
  const reconciliationWorker = createReconciliationWorker()

  console.log('[Worker] All workers started')

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

  const shutdown = async () => {
    console.log('[Worker] Shutting down...')
    clearInterval(overdueInterval)
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
