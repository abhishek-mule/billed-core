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

export async function getTenantStatus(tenantId: string): Promise<{ isActive: boolean; reason?: string }> {
  const redis = getRedis()
  const status = await redis.get<{ isActive: boolean; reason?: string }>(`tenant:${tenantId}`)
  return status || { isActive: true }
}

export async function suspendTenant(tenantId: string, reason: string): Promise<void> {
  const redis = getRedis()
  await redis.set(`tenant:${tenantId}`, JSON.stringify({
    isActive: false,
    reason,
    suspendedAt: Date.now(),
  }))
}

export async function reactivateTenant(tenantId: string): Promise<void> {
  const redis = getRedis()
  await redis.set(`tenant:${tenantId}`, JSON.stringify({
    isActive: true,
    reactivatedAt: Date.now(),
  }))
}

export async function withTenantActiveCheck<T>(
  tenantId: string,
  handler: () => Promise<T>
): Promise<T> {
  const status = await getTenantStatus(tenantId)
  
  if (!status.isActive) {
    throw new Error(`Account suspended: ${status.reason || 'Contact support'}`)
  }
  
  return handler()
}