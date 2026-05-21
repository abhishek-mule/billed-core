import { Worker, Job } from 'bullmq'
import { redis, redisUrl, redisToken } from '../lib/redis'
import { pollOutboxEvents, markEventProcessing, markEventCompleted, markEventFailed } from '../../src/lib/billzo/outbox'
import { withLock } from '../lib/lock'
import { logWorkerEvent, logWorkerError } from '../lib/logging'

/**
 * Outbox Queue Consumer
 * Polls the Supabase outbox table and processes pending events.
 * Each event type is dispatched to its appropriate handler.
 */
export function createOutboxWorker() {
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

          // Acquire lock for this event
          const lockKey = `outbox:${event.id}`
          const result = await withLock(lockKey, 30000, async () => {
            // Mark as processing
            await markEventProcessing(event.id)

            try {
              // Process event based on type
              await processOutboxEvent(event)

              // Mark as completed
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

              // Mark as failed with retry
              const retryResult = await markEventFailed(event.id, event.attempts + 1)
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
      connection: {
        url: redisUrl,
        token: redisToken,
      },
      concurrency: 5,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: 1000,
        removeOnFail: false,
      },
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

/**
 * Process a single outbox event based on its type.
 */
async function processOutboxEvent(event: any): Promise<void> {
  switch (event.type) {
    case 'payment.completed':
    case 'payment.reconciled':
      // Trigger recovery attribution
      await handlePaymentEvent(event)
      break

    case 'recovery.reminder.sent':
      // Track reminder delivery
      await handleReminderEvent(event)
      break

    case 'invoice.overdue':
      // Schedule next recovery stage
      await handleOverdueEvent(event)
      break

    default:
      console.log(`[OutboxWorker] Unhandled event type: ${event.type}`)
  }
}

async function handlePaymentEvent(event: any): Promise<void> {
  // Import dynamically to avoid circular dependencies
  const { attributeRecovery } = await import('../../src/lib/billzo/attribution')

  const invoiceId = event.entityId
  const tenantId = event.tenantId
  const amount = event.payload?.amount || 0

  if (!invoiceId || !tenantId) return

  // Attribute recovery
  await attributeRecovery({
    invoiceId,
    tenantId,
    paymentId: event.payload?.paymentId,
    paymentTimestamp: event.createdAt,
  })
}

async function handleReminderEvent(event: any): Promise<void> {
  // Track reminder delivery status
  console.log(`[OutboxWorker] Reminder sent: ${event.entityId}`)
}

async function handleOverdueEvent(event: any): Promise<void> {
  // Schedule next recovery stage
  console.log(`[OutboxWorker] Invoice overdue: ${event.entityId}`)
}
