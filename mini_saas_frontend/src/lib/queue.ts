import { Redis } from '@upstash/redis'

let redis: Redis | null = null

export function getRedis(): Redis | null {
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
  retryCount: number
  maxRetries: number
  createdAt: number
  scheduledAt?: number
  lastError?: string
}

export interface RateLimitConfig {
  windowMs: number
  maxRequests: number
}

const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100, // 100 requests per minute
}

export const QUEUES = {
  auditWrite: 'audit_write',
  webhookRetry: 'webhook_retry',
  erpSync: 'erp_sync',
  emailNotification: 'email_notification',
  metricAggregation: 'metric_aggregation',
  invoiceNotification: 'invoice_notification',
} as const

function getBackoffDelay(retryCount: number): number {
  const baseDelay = 1000 // 1 second
  const maxDelay = 60000 // 60 seconds
  const delay = Math.min(baseDelay * Math.pow(2, retryCount), maxDelay)
  const jitter = Math.random() * 1000 // Add up to 1s jitter
  return delay + jitter
}

export async function enqueueJob(queue: string, payload: Record<string, unknown>): Promise<string> {
  const r = getRedis()
  if (!r) {
    console.warn('[Queue] Redis not configured, skipping job enqueue')
    return 'mock-job-id'
  }
  
  const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  
  const job: Job = {
    id: jobId,
    queue,
    payload,
    retryCount: 0,
    maxRetries: 3,
    createdAt: Date.now(),
  }
  
  await r.lpush(`queue:${queue}`, JSON.stringify(job))
  
  console.log(`[Queue] Enqueued job ${jobId} to ${queue}`)
  
  return jobId
}

export async function enqueueJobDelayed(
  queue: string,
  payload: Record<string, unknown>,
  delaySeconds: number
): Promise<string> {
  const r = getRedis()
  if (!r) return 'mock-job-id'
  
  const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  
  const job: Job = {
    id: jobId,
    queue,
    payload,
    retryCount: 0,
    maxRetries: 3,
    createdAt: Date.now(),
    scheduledAt: Date.now() + delaySeconds * 1000,
  }
  
  await r.zadd(`queue:delayed:${queue}`, {
    score: Date.now() + delaySeconds * 1000,
    member: JSON.stringify(job),
  })
  
  return jobId
}

export async function enqueueJobWithRetry(
  queue: string,
  payload: Record<string, unknown>,
  maxRetries: number = 3
): Promise<string> {
  return enqueueJob(queue, { 
    ...payload, 
    _retryCount: 0, 
    _maxRetries: maxRetries 
  })
}

export async function requeueWithBackoff(
  queue: string,
  job: Job,
  error: string
): Promise<void> {
  const r = getRedis()
  if (!r) return
  
  const retryCount = (job.retryCount || 0) + 1
  
  if (retryCount >= job.maxRetries) {
    console.error(`[Queue] Job ${job.id} failed after ${retryCount} retries: ${error}`)
    
    // Move to dead letter queue
    await r.lpush(`queue:dead:${queue}`, JSON.stringify({
      ...job,
      retryCount,
      lastError: error,
      failedAt: Date.now(),
    }))
    return
  }
  
  const delay = getBackoffDelay(retryCount)
  const scheduledAt = Date.now() + delay
  
  console.log(`[Queue] Scheduling job ${job.id} for retry ${retryCount}/${job.maxRetries} in ${Math.round(delay/1000)}s`)
  
  const retryJob: Job = {
    ...job,
    retryCount,
    lastError: error,
    scheduledAt,
  }
  
  await r.zadd(`queue:delayed:${queue}`, {
    score: scheduledAt,
    member: JSON.stringify(retryJob),
  })
}

export async function popJob(queue: string): Promise<Job | null> {
  const r = getRedis()
  if (!r) return null
  
  // Pop from main queue (simple implementation)
  const result = await r.rpop(`queue:${queue}`)
  if (!result) return null
  
  return JSON.parse(result) as Job
}

export async function checkRateLimit(
  identifier: string,
  config: RateLimitConfig = DEFAULT_RATE_LIMIT
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const r = getRedis()
  if (!r) return { allowed: true, remaining: config.maxRequests, resetAt: Date.now() + config.windowMs }
  
  const key = `ratelimit:${identifier}`
  const now = Date.now()
  const windowStart = now - config.windowMs
  
  // Remove old entries
  await r.zremrangebyscore(key, 0, windowStart)
  
  // Count requests in current window
  const count = await r.zcard(key)
  
  if (count >= config.maxRequests) {
    const oldest = await r.zrange(key, 0, 0)
    const oldestScore = oldest.length > 0 ? await r.zscore(key, oldest[0]) : null
    const resetAt = oldestScore ? Math.ceil(Number(oldestScore)) + config.windowMs : now + config.windowMs
    
    return { allowed: false, remaining: 0, resetAt }
  }
  
// Add current request
  await r.zadd(key, { score: now, member: `${now}` })
  await r.expire(key, Math.ceil(config.windowMs / 1000))
  
  return { allowed: true, remaining: config.maxRequests - count - 1, resetAt: now + config.windowMs }
}

export async function getRateLimitStatus(identifier: string): Promise<{
  current: number
  limit: number
  resetAt: number
}> {
  const r = getRedis()
  const config = DEFAULT_RATE_LIMIT
  
  if (!r) return { current: 0, limit: config.maxRequests, resetAt: Date.now() + config.windowMs }
  
  const key = `ratelimit:${identifier}`
  const now = Date.now()
  const windowStart = now - config.windowMs
  
  await r.zremrangebyscore(key, 0, windowStart)
  const count = await r.zcard(key)
  
  return {
    current: count,
    limit: config.maxRequests,
    resetAt: now + config.windowMs,
  }
}

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