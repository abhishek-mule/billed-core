import { Worker, Job } from 'bullmq'
import { redisUrl, redisToken } from '../lib/redis'
import { withLock } from '../lib/lock'
import { logWorkerEvent, logWorkerError } from '../lib/logging'

/**
 * Reminders Queue Consumer
 * Sends scheduled recovery reminders via configured channels.
 */
export function createRemindersWorker() {
  const worker = new Worker(
    'reminders',
    async (job: Job) => {
      const startTime = Date.now()
      const { invoiceId, tenantId, stage, channel } = job.data

      try {
        // Acquire lock to prevent duplicate sends
        const lockKey = `reminder:${invoiceId}:${stage}`
        const result = await withLock(lockKey, 60000, async () => {
          // Send reminder via channel
          console.log(`[RemindersWorker] Sending ${stage} reminder for invoice ${invoiceId}`)

          // TODO: Implement actual reminder sending via RecoveryChannel
          // For now, just log

          return { sent: true, invoiceId, stage }
        })

        if (!result) {
          return { skipped: true, reason: 'lock_not_acquired' }
        }

        const duration = Date.now() - startTime
        logWorkerEvent({
          tenant_id: tenantId,
          entity_id: invoiceId,
          queue_name: 'reminders',
          attempt: job.attemptsMade,
          status: 'success',
          duration_ms: duration,
          timestamp: new Date().toISOString(),
          level: 'info',
          message: `Reminder sent: ${stage}`,
        })

        return result
      } catch (err: any) {
        logWorkerError(err as Error, {
          tenant_id: tenantId,
          entity_id: invoiceId,
          queue_name: 'reminders',
          attempt: job.attemptsMade,
          duration_ms: Date.now() - startTime,
          status: 'failed',
          message: `Failed to send reminder: ${stage}`,
        })
        throw err
      }
    },
    {
      connection: {
        url: redisUrl,
        token: redisToken,
      },
      concurrency: 10,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'fixed',
          delay: 30000,
        },
        removeOnComplete: 1000,
        removeOnFail: false,
      },
    }
  )

  worker.on('completed', (job) => {
    console.log(`[RemindersWorker] Job ${job.id} completed:`, job.returnvalue)
  })

  worker.on('failed', (job, err) => {
    console.error(`[RemindersWorker] Job ${job?.id} failed:`, err.message)
  })

  return worker
}
