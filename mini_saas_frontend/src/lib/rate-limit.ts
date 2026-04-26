import { NextRequest, NextResponse } from 'next/server'
import { getRedis } from '@/lib/queue'

interface RateLimitConfig {
  windowMs: number
  maxRequests: number
}

const PUBLIC_ENDPOINTS: Record<string, RateLimitConfig> = {
  '/api/auth/login': { windowMs: 60000, maxRequests: 10 },
  '/api/onboard': { windowMs: 60000, maxRequests: 5 },
  '/api/createorder': { windowMs: 60000, maxRequests: 20 },
}

const PRIVATE_ENDPOINTS: Record<string, RateLimitConfig> = {
  '/api/merchant/invoices': { windowMs: 60000, maxRequests: 100 },
  '/api/merchant/invoices/create': { windowMs: 60000, maxRequests: 60 },
  '/api/v2/invoices': { windowMs: 60000, maxRequests: 100 },
}

const DEFAULT_PUBLIC_LIMIT: RateLimitConfig = { windowMs: 60000, maxRequests: 60 }
const DEFAULT_PRIVATE_LIMIT: RateLimitConfig = { windowMs: 60000, maxRequests: 200 }

function getRateLimitConfig(path: string, isAuthenticated: boolean): RateLimitConfig {
  if (isAuthenticated) {
    return PRIVATE_ENDPOINTS[path] || DEFAULT_PRIVATE_LIMIT
  }
  return PUBLIC_ENDPOINTS[path] || DEFAULT_PUBLIC_LIMIT
}

function getRateLimitIdentifier(request: NextRequest, isAuthenticated: boolean): string {
  const tenantId = request.headers.get('x-tenant-id')
  if (isAuthenticated && tenantId) {
    return `tenant:${tenantId}`
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]
    || request.headers.get('x-real-ip')
    || 'unknown'
  
  return `ip:${ip}`
}

export async function rateLimitMiddleware(request: NextRequest): Promise<NextResponse | null> {
  if (request.nextUrl.pathname === '/api/health') {
    return null
  }

  const isAuthenticated = request.headers.get('authorization') !== null
  const config = getRateLimitConfig(request.nextUrl.pathname, isAuthenticated)
  const identifier = getRateLimitIdentifier(request, isAuthenticated)
  const key = `ratelimit:${identifier}:${request.nextUrl.pathname}`

  const redis = getRedis()
  if (!redis) {
    return null
  }

  const now = Date.now()
  const windowStart = now - config.windowMs

  try {
    await redis.zremrangebyscore(key, 0, windowStart)
    const count = await redis.zcard(key)

    if (count >= config.maxRequests) {
      console.warn(`[RateLimit] ${identifier} exceeded limit for ${request.nextUrl.pathname}`)

      return NextResponse.json(
        {
          error: 'Rate limit exceeded',
          retryAfter: Math.ceil(config.windowMs / 1000),
          limit: config.maxRequests,
          window: Math.ceil(config.windowMs / 1000),
        },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': config.maxRequests.toString(),
            'X-RateLimit-Remaining': '0',
            'Retry-After': Math.ceil(config.windowMs / 1000).toString(),
          },
        }
      )
    }

    await redis.zadd(key, { score: now, member: `${now}` })
    await redis.expire(key, Math.ceil(config.windowMs / 1000))

    return null
  } catch (error) {
    console.error('[RateLimit] Error:', error)
    return null
  }
}

export async function applyRateLimiting(request: NextRequest): Promise<NextResponse | null> {
  return rateLimitMiddleware(request)
}