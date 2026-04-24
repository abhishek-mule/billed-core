import { Redis } from '@upstash/redis'

const CACHE_TTL = 600

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

export interface CachedCredentials {
  apiKey: string
  apiSecret: string
  erpSite: string
  version: string
}

export async function cacheCredentials(
  tenantId: string, 
  creds: CachedCredentials
): Promise<void> {
  const redis = getRedis()
  await redis.set(`tenant_creds:${tenantId}`, JSON.stringify(creds), { ex: CACHE_TTL })
}

export async function getCachedCredentials(tenantId: string): Promise<CachedCredentials | null> {
  const redis = getRedis()
  const cached = await redis.get(`tenant_creds:${tenantId}`)
  if (!cached) return null
  return typeof cached === 'string' ? JSON.parse(cached) : cached as CachedCredentials
}

export async function invalidateCredentialCache(tenantId: string): Promise<void> {
  const redis = getRedis()
  await redis.del(`tenant_creds:${tenantId}`)
}

export async function warmCredentialCache(
  tenantId: string,
  creds: CachedCredentials
): Promise<void> {
  await cacheCredentials(tenantId, creds)
}

export async function getOrFetchCredentials<T>(
  tenantId: string,
  fetcher: () => Promise<T extends CachedCredentials ? T : CachedCredentials>
): Promise<T extends CachedCredentials ? T : CachedCredentials> {
  const cached = await getCachedCredentials(tenantId)
  if (cached) {
    return cached as any
  }
  
  const creds = await fetcher()
  await cacheCredentials(tenantId, creds)
  return creds as any
}