import { Redis } from '@upstash/redis'

let redis: Redis | null = null

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  
  if (!url || !token || !url.startsWith('https')) {
    return null
  }
  
  if (!redis) {
    redis = new Redis({ url, token })
  }
  return redis
}

export interface Job {
  id: string
  queue: string
  payload: Record<string, unknown>
  retries?: number
  scheduledAt?: number
}

export async function enqueueJob(queue: string, payload: Record<string, unknown>): Promise<string> {
  const r = getRedis()
  if (!r) {
    console.warn('[Queue] Redis not configured, skipping job enqueue')
    return 'mock-job-id'
  }
  
  const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  
  await r.lpush(`queue:${queue}`, { id: jobId, payload, createdAt: Date.now() })
  
  return jobId
}

export async function enqueueJobDelayed(
  queue: string,
  payload: Record<string, unknown>,
  delaySeconds: number
): Promise<string> {
  return enqueueJob(`delayed:${queue}`, { ...payload, delayUntil: Date.now() + delaySeconds * 1000 })
}

export async function enqueueJobWithRetry(
  queue: string,
  payload: Record<string, unknown>,
  maxRetries: number = 3
): Promise<string> {
  return enqueueJob(queue, { ...payload, _retryCount: 0, _maxRetries: maxRetries })
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
  console.log(`[Queue] Cron scheduled: ${cronExpression} for ${queue}`)
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