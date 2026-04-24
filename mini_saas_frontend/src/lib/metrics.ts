import { Redis } from '@upstash/redis'

let redis: Redis | null = null

function getRedis(): Redis {
  if (!redis) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
  }
  return redis
}

const METRICS_TTL = 86400

export async function incrementMetric(name: string, value: number = 1): Promise<void> {
  const redis = getRedis()
  const today = new Date().toISOString().split('T')[0]
  const key = `metrics:${name}:${today}`
  
  await redis.incrby(key, value)
  await redis.expire(key, METRICS_TTL)
}

export async function getMetric(name: string, date?: string): Promise<number> {
  const redis = getRedis()
  const targetDate = date || new Date().toISOString().split('T')[0]
  const key = `metrics:${name}:${targetDate}`
  
  const value = await redis.get<number>(key)
  return value || 0
}

export async function getMetricsSummary(
  names: string[],
  days: number = 7
): Promise<Record<string, number>> {
  const summary: Record<string, number> = {}
  
  for (const name of names) {
    let total = 0
    for (let i = 0; i < days; i++) {
      const date = new Date()
      date.setDate(date.getDate() - i)
      const dateStr = date.toISOString().split('T')[0]
      total += await getMetric(name, dateStr)
    }
    summary[name] = total
  }
  
  return summary
}

export const METRIC_NAMES = {
  sessionsCreated: 'sessions_created',
  invoiceCreated: 'invoice_created',
  invoiceDeleted: 'invoice_deleted',
  erpErrors: 'erp_errors',
  authFailures: 'auth_failures',
  csrfRejections: 'csrf_rejections',
  rateLimits: 'rate_limits',
} as const