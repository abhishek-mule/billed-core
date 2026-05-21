import { createOutboxWorker } from './queues/outbox'
import { createRemindersWorker } from './queues/reminders'
import { createReconciliationWorker } from './queues/reconciliation'

// ============================================================
// BillZo Worker Service
// Runs on Render/Fly.io as a durable background worker.
// Connects to Upstash Redis for BullMQ queues.
// ============================================================

async function main() {
  console.log('[Worker] Starting BillZo worker service...')

  // Validate environment
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    console.error('[Worker] Missing Redis environment variables')
    process.exit(1)
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[Worker] Missing Supabase environment variables')
    process.exit(1)
  }

  // Create workers
  const outboxWorker = createOutboxWorker()
  const remindersWorker = createRemindersWorker()
  const reconciliationWorker = createReconciliationWorker()

  console.log('[Worker] All workers started')

  // Graceful shutdown
  const shutdown = async () => {
    console.log('[Worker] Shutting down workers...')
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

  // Keep process alive
  process.stdin.resume()
}

main().catch((err) => {
  console.error('[Worker] Fatal error:', err)
  process.exit(1)
})
