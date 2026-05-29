import { Worker, Queue } from 'bullmq'
import { createRedisConnection } from '../lib/redis'
import { runCognitionPipeline } from '../src/lib/cognition/pipeline'
import { logger } from '../src/lib/billzo/logger'
import { supabaseAdmin } from '../src/lib/billzo/supabase-admin'

const connection = createRedisConnection()

export function createCognitionWorker() {
  const worker = new Worker<{ tenantId: string }>(
    'cognition',
    async (job) => {
      const { tenantId } = job.data
      const t0 = performance.now()

      try {
        const result = await runCognitionPipeline(tenantId)
        const duration = performance.now() - t0

        logger.info({
          tenantId,
          itemsComputed: result.itemsComputed,
          situationsGenerated: result.situationsGenerated,
          durationMs: Math.round(duration),
        }, 'Cognition pipeline complete')

        return result
      } catch (err: any) {
        logger.error({ tenantId, err: err.message }, 'Cognition pipeline failed')
        throw err
      }
    },
    {
      connection,
      concurrency: 5,
    }
  )

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id, result: job.returnvalue }, 'Cognition job completed')
  })

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, 'Cognition job failed')
  })

  return worker
}

export function createCognitionQueue() {
  const conn = createRedisConnection()
  return new Queue<{ tenantId: string }>('cognition', { connection: conn })
}

export async function enqueueCognitionJob(tenantId: string): Promise<void> {
  const queue = createCognitionQueue()
  await queue.add(`cognition:${tenantId}`, { tenantId }, {
    attempts: 2,
    backoff: { type: 'exponential', delay: 30000 },
  })
  await queue.close()
}

export async function enqueueCognitionJobs(): Promise<number> {
  const { data: tenants, error } = await supabaseAdmin
    .from('tenants')
    .select('id')
    .limit(200)

  if (error || !tenants) {
    logger.error({ err: error?.message }, 'Failed to fetch tenants for cognition')
    return 0
  }

  let enqueued = 0

  for (const t of tenants) {
    await enqueueCognitionJob(t.id)
    enqueued++
  }

  logger.info({ enqueued }, 'Enqueued cognition jobs')
  return enqueued
}
