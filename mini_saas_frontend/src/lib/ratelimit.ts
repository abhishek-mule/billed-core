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

export interface RateLimitConfig {
  window: number
  limit: number
}

export const LIMITS = {
  auth: { window: 60, limit: 5 },
  tenantWrite: { window: 60, limit: 60 },
  erpProxy: { window: 60, limit: 120 },
}

export async function checkRateLimit(
  key: string,
  config: RateLimitConfig
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const redis = getRedis()
  const now = Date.now()
  const windowMs = config.window * 1000
  
  const current = await redis.get<number>(key)
  
  if (!current) {
    await redis.set(key, '1', { ex: config.window })
    return { allowed: true, remaining: config.limit - 1, resetAt: now + windowMs }
  }
  
  if (current >= config.limit) {
    const ttl = await redis.ttl(key)
    return { allowed: false, remaining: 0, resetAt: now + (ttl > 0 ? ttl * 1000 : windowMs) }
  }
  
  await redis.incr(key)
  
  return {
    allowed: true,
    remaining: config.limit - current - 1,
    resetAt: now + windowMs,
  }
}

export async function getRateLimitKey(type: string, identifier: string): Promise<string> {
  return `ratelimit:${type}:${identifier}`
}

export async function withRateLimit(
  type: keyof typeof LIMITS,
  getKey: (request: Request) => string
) {
  return async (request: Request): Promise<{ allowed: boolean; error?: Response }> => {
    const key = await getKey(request)
    const config = LIMITS[type]
    const result = await checkRateLimit(key, config)
    
    if (!result.allowed) {
      return {
        allowed: false,
        error: Response.json(
          { error: 'Rate limit exceeded', retryAfter: Math.ceil((result.resetAt - Date.now()) / 1000) },
          { status: 429, headers: { 'Retry-After': String(Math.ceil((result.resetAt - Date.now()) / 1000)) } }
        ),
      }
    }
    
    return { allowed: true }
  }
}

export async function getAuthRateLimit(request: Request): Promise<string> {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() 
    || request.headers.get('x-real-ip') 
    || 'unknown'
  return `ratelimit:auth:${ip}`
}

export async function getTenantWriteRateLimit(request: Request, tenantId: string): Promise<string> {
  return `ratelimit:tenant_write:${tenantId}`
}

export async function getErpProxyRateLimit(tenantId: string): Promise<string> {
  return `ratelimit:erp_proxy:${tenantId}`
}