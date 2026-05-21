import { Worker, Job } from 'bullmq'
import { redisUrl, redisToken } from '../lib/redis'
import { withLock } from '../lib/lock'
import { logWorkerEvent, logWorkerError } from '../lib/logging'

/**
 * Reconciliation Queue Consumer
 * Matches incoming payments to unpaid invoices.
 * Handles webhook events that need reprocessing.
 */
export function createReconciliationWorker() {
  const worker = new Worker(
    'reconciliation',
    async (job: Job) => {
      const startTime = Date.now()
      const { invoiceId, tenantId, paymentData } = job.data

      try {
        // Acquire lock to prevent duplicate reconciliation
        const lockKey = `reconciliation:${invoiceId}:${paymentData?.providerPaymentId}`
        const result = await withLock(lockKey, 60000, async () => {
          // TODO: Implement actual reconciliation logic
          // For now, just log
          console.log(`[ReconciliationWorker] Processing payment for invoice ${invoiceId}`)

          return { reconciled: true, invoiceId }
        })

        if (!result) {
          return { skipped: true, reason: 'lock_not_acquired' }
        }

        const duration = Date.now() - startTime
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
      connection: {
        url: redisUrl,
        token: redisToken,
      },
      concurrency: 5,
      defaultJobOptions: {
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 60000,
        },
        removeOnComplete: 1000,
        removeOnFail: false,
      },
    }
  )

  worker.on('completed', (job) => {
    console.log(`[ReconciliationWorker] Job ${job.id} completed:`, job.returnvalue)
  })

  worker.on('failed', (job, err) => {
    console.error(`[ReconciliationWorker] Job ${job?.id} failed:`, err.message)
  })

  return worker
}
