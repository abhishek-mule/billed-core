import { Redis } from '@upstash/redis'
import { Qstash } from '@upstash/qstash'

let redis: Redis | null = null
let qstash: Qstash | null = null

function getRedis(): Redis {
  if (!redis) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
  }
  return redis
}

function getQstash(): Qstash {
  if (!qstash) {
    qstash = new Qstash({ token: process.env.UPSTASH_QSTASH_TOKEN! })
  }
  return qstash
}

export interface Job {
  id: string
  queue: string
  payload: Record<string, unknown>
  retries?: number
  scheduledAt?: number
}

export async function enqueueJob(queue: string, payload: Record<string, unknown>): Promise<string> {
  const qstash = getQstash()
  const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  
  await qstash.publish({
    topic: queue,
    message: { id: jobId, payload },
  })
  
  return jobId
}

export async function enqueueJobDelayed(
  queue: string,
  payload: Record<string, unknown>,
  delaySeconds: number
): Promise<string> {
  const qstash = getQstash()
  const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  const scheduledAt = Date.now() + delaySeconds * 1000
  
  await qstash.publish({
    topic: `delayed:${queue}`,
    message: { id: jobId, payload, scheduledAt },
    delay: delaySeconds,
  })
  
  return jobId
}

export async function enqueueJobWithRetry(
  queue: string,
  payload: Record<string, unknown>,
  maxRetries: number = 3
): Promise<string> {
  const jobId = await enqueueJob(queue, { ...payload, _retryCount: 0, _maxRetries: maxRetries })
  return jobId
}

export const QUEUES = {
  auditWrite: 'audit_write',
  webhookRetry: 'webhook_retry',
  erpSync: 'erp_sync',
  emailNotification: 'email_notification',
  metricAggregation: 'metric_aggregation',
} as const

export async function createQueueHandler(
  queue: string,
  handler: (job: Job) => Promise<void>
): Promise<void> {
  console.log(`[Queue] Handler registered for ${queue}`)
}

export async function scheduleCron(
  queue: string,
  cronExpression: string,
  handler: () => Promise<void>
): Promise<void> {
  const qstash = getQstash()
  
  await qstash.publish({
    topic: `cron:${queue}`,
    message: { cron: cronExpression },
    delay: 0,
  })
}

export async function processQueueJob(
  queue: string,
  message: Record<string, unknown>
): Promise<void> {
  const job = message as unknown as Job
  
  console.log(`[Queue] Processing job ${job.id} from ${queue}`)
  
  switch (queue) {
    case QUEUES.auditWrite:
      break
    case QUEUES.webhookRetry:
      break
    case QUEUES.erpSync:
      break
    default:
      console.warn(`[Queue] Unknown queue: ${queue}`)
  }
}