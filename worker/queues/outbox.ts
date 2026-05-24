import { Worker, Job, Queue } from 'bullmq'
import { createRedisConnection } from '../lib/redis'
import { pollOutboxEvents, markEventProcessing, markEventCompleted, markEventFailed } from '../src/lib/billzo/outbox'
import { supabaseAdmin } from '../src/lib/billzo/supabase-admin'
import { withLock } from '../lib/lock'
import { logWorkerEvent, logWorkerError } from '../lib/logging'

export function createOutboxWorker() {
  const connection = createRedisConnection()

  const worker = new Worker(
    'outbox',
    async (job: Job) => {
      const startTime = Date.now()

      try {
        const events = await pollOutboxEvents(50)

        if (events.length === 0) {
          return { processed: 0 }
        }

        let processed = 0

        for (const event of events) {
          const eventStartTime = Date.now()

          const lockKey = `outbox:${event.id}`
          const result = await withLock(lockKey, 30000, async () => {
            await markEventProcessing(event.id)

            try {
              await processOutboxEvent(event)
              await markEventCompleted(event.id)

              const duration = Date.now() - eventStartTime
              logWorkerEvent({
                event_id: event.id,
                tenant_id: event.tenantId,
                entity_id: event.entityId,
                correlation_id: event.correlationId,
                queue_name: 'outbox',
                attempt: event.attempts,
                status: 'success',
                duration_ms: duration,
                timestamp: new Date().toISOString(),
                level: 'info',
                message: `Processed event: ${event.type}`,
              })

              return true
            } catch (err: any) {
              const duration = Date.now() - eventStartTime
              logWorkerError(err as Error, {
                event_id: event.id,
                tenant_id: event.tenantId,
                entity_id: event.entityId,
                queue_name: 'outbox',
                attempt: event.attempts,
                duration_ms: duration,
                message: `Failed to process event: ${event.type}`,
              })

              await markEventFailed(event.id, event.attempts + 1)
              return false
            }
          })

          if (result !== null) {
            processed++
          }
        }

        return { processed }
      } catch (err: any) {
        logWorkerError(err as Error, {
          tenant_id: 'unknown',
          queue_name: 'outbox',
          attempt: 0,
          duration_ms: Date.now() - startTime,
          status: 'failed',
          message: 'Outbox worker error',
        })
        throw err
      }
    },
    {
      connection,
      concurrency: 5,
    }
  )

  worker.on('completed', (job) => {
    console.log(`[OutboxWorker] Job ${job.id} completed:`, job.returnvalue)
  })

  worker.on('failed', (job, err) => {
    console.error(`[OutboxWorker] Job ${job?.id} failed:`, err.message)
  })

  return worker
}

async function processOutboxEvent(event: any): Promise<void> {
  switch (event.type) {
    case 'payment.completed':
    case 'payment.reconciled':
      await handlePaymentEvent(event)
      break

    case 'recovery.reminder.sent':
      await handleReminderEvent(event)
      break

    case 'invoice.overdue':
      await handleOverdueEvent(event)
      break

    default:
      console.log(`[OutboxWorker] Unhandled event type: ${event.type}`)
  }
}

async function handlePaymentEvent(event: any): Promise<void> {
  const { attributeRecovery } = await import('../src/lib/billzo/attribution')

  const invoiceId = event.entityId
  const tenantId = event.tenantId

  if (!invoiceId || !tenantId) return

  await attributeRecovery({
    invoiceId,
    tenantId,
    paymentId: event.payload?.paymentId,
    paymentTimestamp: event.createdAt,
  })
}

async function handleReminderEvent(event: any): Promise<void> {
  console.log(`[OutboxWorker] Reminder sent: ${event.entityId}`)
}

async function handleOverdueEvent(event: any): Promise<void> {
  const invoiceId = event.entityId
  const tenantId = event.tenantId
  if (!invoiceId || !tenantId) return

  const { data: invoice } = await supabaseAdmin
    .from('invoices')
    .select('recovery_stage')
    .eq('id', invoiceId)
    .single()

  const stage = invoice?.recovery_stage || 't1_soft'
  const connection = createRedisConnection()
  const queue = new Queue('reminders', { connection })
  try {
    await queue.add(`reminder:${invoiceId}:${stage}`, { invoiceId, tenantId, stage }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 60000 },
    })
    console.log(`[OutboxWorker] Enqueued ${stage} reminder for overdue invoice ${invoiceId}`)
  } finally {
    await queue.close()
  }
}
