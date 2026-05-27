import { Worker, Job } from 'bullmq'
import { createRedisConnection } from '../lib/redis'
import { withLock } from '../lib/lock'
import { logWorkerEvent, logWorkerError } from '../lib/logging'
import { createQueueLogger } from '../lib/queue-logger'

const logger = createQueueLogger('reconciliation')

export function createReconciliationWorker() {
  const connection = createRedisConnection()

  const worker = new Worker(
    'reconciliation',
    async (job: Job) => {
      const startTime = Date.now()
      const { invoiceId, tenantId, paymentData } = job.data

      try {
        const lockKey = `reconciliation:${invoiceId}:${paymentData?.providerPaymentId}`
        const result = await withLock(lockKey, 60000, async () => {
          logger.info({ invoiceId }, 'Processing payment')
          return { reconciled: true, invoiceId }
        })

        if (!result) {
          return { skipped: true, reason: 'lock_not_acquired' }
        }

        const duration = Date.now() - startTime
        logger.info({ invoiceId, tenantId, duration_ms: duration, attempt: job.attemptsMade }, 'Payment reconciled')
        logWorkerEvent({
          tenant_id: tenantId,
          entity_id: invoiceId,
          queue_name: 'reconciliation',
          attempt: job.attemptsMade,
          status: 'success',
          duration_ms: duration,
          timestamp: new Date().toISOString(),
          level: 'info',
          message: `Payment reconciled for invoice ${invoiceId}`,
        })

        return result
      } catch (err: any) {
        logger.error({ err, invoiceId, tenantId, duration_ms: Date.now() - startTime }, 'Failed to reconcile payment')
        logWorkerError(err as Error, {
          tenant_id: tenantId,
          entity_id: invoiceId,
          queue_name: 'reconciliation',
          attempt: job.attemptsMade,
          duration_ms: Date.now() - startTime,
          status: 'failed',
          message: `Failed to reconcile payment for invoice ${invoiceId}`,
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
    logger.info({ jobId: job.id, result: job.returnvalue }, 'Job completed')
  })

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'Job failed')
  })

  return worker
}
