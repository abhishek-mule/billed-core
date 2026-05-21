import { createOutboxWorker } from './queues/outbox'
import { createRemindersWorker } from './queues/reminders'
import { createReconciliationWorker } from './queues/reconciliation'

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

  const outboxWorker = createOutboxWorker()
  const remindersWorker = createRemindersWorker()
  const reconciliationWorker = createReconciliationWorker()

  console.log('[Worker] All workers started')

  const shutdown = async () => {
    console.log('[Worker] Shutting down...')
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
