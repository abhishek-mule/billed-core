import { Worker, Job, Queue } from 'bullmq'
import { createRedisConnection } from '../lib/redis'
import { supabaseAdmin } from '../src/lib/billzo/supabase-admin'
import { sendPushNotification } from '../src/lib/billzo/notifications'
import { createQueueLogger } from '../lib/queue-logger'

const logger = createQueueLogger('retry')

const MAX_RETRY_ATTEMPTS = 3
const BACKOFF_DELAYS = [60000, 300000, 900000] // 1min, 5min, 15min

export function createRetryWorker() {
  const connection = createRedisConnection()

  const worker = new Worker(
    'retry',
    async (job: Job) => {
      const { eventId, attempt } = job.data

      const { data: event } = await supabaseAdmin
        .from('outbox')
        .select('*')
        .eq('id', eventId)
        .single()

      if (!event) {
        logger.warn({ eventId }, 'Dead letter event not found, skipping')
        return { recovered: false, reason: 'not_found' }
      }

      if (event.status !== 'dead_letter') {
        return { recovered: false, reason: 'not_dead_letter' }
      }

      const nextDelay = BACKOFF_DELAYS[attempt] || 1800000
      const nextAttemptAt = new Date(Date.now() + nextDelay).toISOString()

      const { error } = await supabaseAdmin
        .from('outbox')
        .update({
          status: 'pending',
          next_attempt_at: nextAttemptAt,
          attempts: event.attempts,
        })
        .eq('id', eventId)

      if (error) {
        logger.error({ eventId, err: error.message }, 'Failed to reset dead letter event')
        throw error
      }

      logger.info({ eventId, attempt: attempt + 1, nextAttemptAt }, 'Dead letter event rescheduled for retry')

      if (attempt >= MAX_RETRY_ATTEMPTS - 1) {
        await sendPushNotification({
          tenantId: event.tenant_id,
          title: 'Message delivery failing persistently',
          body: `A ${event.type} event keeps failing. Check your channel connection.`,
          type: 'delivery_alert',
          url: '/settings/whatsapp',
        }).catch(() => {})
      }

      return { recovered: true, attempt: attempt + 1 }
    },
    {
      connection,
      concurrency: 3,
    },
  )

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id, result: job.returnvalue }, 'Retry job completed')
  })

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'Retry job failed')
  })

  return worker
}

export async function enqueueDeadLetterRetries(): Promise<number> {
  const { data: events } = await supabaseAdmin
    .from('outbox')
    .select('id, attempts, updated_at')
    .eq('status', 'dead_letter')
    .lte('updated_at', new Date(Date.now() - 60000).toISOString())
    .limit(50)

  if (!events || events.length === 0) return 0

  const connection = createRedisConnection()
  const queue = new Queue('retry', { connection })

  try {
    let enqueued = 0
    for (const ev of events) {
      const attempt = Math.min(ev.attempts || 0, MAX_RETRY_ATTEMPTS - 1)
      await queue.add(
        `retry:${ev.id}`,
        { eventId: ev.id, attempt },
        {
          attempts: 1,
          removeOnComplete: true,
          removeOnFail: false,
        },
      )
      enqueued++
    }
    return enqueued
  } finally {
    await queue.close()
    connection.disconnect()
  }
}
