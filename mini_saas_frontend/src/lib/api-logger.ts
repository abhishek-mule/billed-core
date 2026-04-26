import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { Redis } from '@upstash/redis'
import crypto from 'crypto'

let redis: Redis | null = null

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token || !url.startsWith('https')) return null
  if (!redis) redis = new Redis({ url, token })
  return redis
}

export interface RequestLog {
  id: string
  method: string
  path: string
  statusCode: number
  duration: number
  tenantId?: string
  userId?: string
  ip?: string
  userAgent?: string
  error?: string
  timestamp: number
}

const LOG_TTL = 86400 // 24 hours
const MAX_LOGS_PER_TENANT = 1000

export function generateCorrelationId(): string {
  return `corr_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`
}

export function getCorrelationId(headers: Headers): string {
  return headers.get('x-correlation-id') || generateCorrelationId()
}

export async function logRequest(log: RequestLog): Promise<void> {
  const r = getRedis()
  if (!r) {
    console.log(`[API] ${log.method} ${log.path} ${log.statusCode} ${log.duration}ms`)
    return
  }

  const key = log.tenantId ? `logs:${log.tenantId}` : `logs:global`
  
  try {
    await r.lpush(key, JSON.stringify(log))
    await r.ltrim(key, 0, MAX_LOGS_PER_TENANT - 1)
    await r.expire(key, LOG_TTL)
  } catch (error) {
    console.error('[Log] Failed to store request log:', error)
  }
}

export async function getRequestLogs(
  tenantId: string,
  limit: number = 100
): Promise<RequestLog[]> {
  const r = getRedis()
  if (!r) return []

  const logs = await r.lrange(`logs:${tenantId}`, 0, limit - 1)
  return logs.map(log => JSON.parse(log) as RequestLog)
}

export async function getErrorLogs(
  tenantId: string,
  limit: number = 50
): Promise<RequestLog[]> {
  const r = getRedis()
  if (!r) return []

  const allLogs = await r.lrange(`logs:${tenantId}`, 0, 200)
  return allLogs
    .map(log => JSON.parse(log) as RequestLog)
    .filter(log => log.statusCode >= 400)
    .slice(0, limit)
}

export function createApiLogger() {
  return async function apiLogger(
    request: NextRequest,
    handler: (request: NextRequest) => Promise<NextResponse>
  ): Promise<NextResponse> {
    const startTime = Date.now()
    const correlationId = getCorrelationId(request.headers)
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] 
      || request.headers.get('x-real-ip')
      || 'unknown'
    const userAgent = request.headers.get('user-agent') || 'unknown'
    
    // Add correlation ID to request context
    const headers = new Headers(request.headers)
    headers.set('x-correlation-id', correlationId)

    let response: NextResponse
    let statusCode = 200
    let error: string | undefined

    try {
      response = await handler(request)
      statusCode = response.status
    } catch (error) {
      statusCode = 500
      error = error instanceof Error ? error.message : 'Internal error'
      response = NextResponse.json(
        { error: error || 'Internal server error' },
        { status: 500 }
      )
    }

    const duration = Date.now() - startTime

    // Extract tenant/user info from session if available
    let tenantId: string | undefined
    let userId: string | undefined

    try {
      const sessionHeader = request.headers.get('x-session-data')
      if (sessionHeader) {
        const session = JSON.parse(Buffer.from(sessionHeader, 'base64').toString())
        tenantId = session.tenantId
        userId = session.userId
      }
    } catch {
      // Session parsing failed, ignore
    }

    // Log the request
    await logRequest({
      id: correlationId,
      method: request.method,
      path: request.nextUrl.pathname,
      statusCode,
      duration,
      tenantId,
      userId,
      ip,
      userAgent,
      error,
      timestamp: Date.now(),
    })

    // Add correlation ID to response headers
    response.headers.set('x-correlation-id', correlationId)

    return response
  }
}

export async function getApiMetrics(tenantId: string): Promise<{
  totalRequests: number
  errorRate: number
  avgDuration: number
  p95Duration: number
  requestsByEndpoint: Record<string, number>
  requestsByStatus: Record<string, number>
}> {
  const r = getRedis()
  if (!r) {
    return {
      totalRequests: 0,
      errorRate: 0,
      avgDuration: 0,
      p95Duration: 0,
      requestsByEndpoint: {},
      requestsByStatus: {},
    }
  }

  const logs = await r.lrange(`logs:${tenantId}`, 0, 499)
  const parsedLogs = logs.map(l => JSON.parse(l) as RequestLog)

  if (parsedLogs.length === 0) {
    return {
      totalRequests: 0,
      errorRate: 0,
      avgDuration: 0,
      p95Duration: 0,
      requestsByEndpoint: {},
      requestsByStatus: {},
    }
  }

  const errors = parsedLogs.filter(l => l.statusCode >= 400).length
  const durations = parsedLogs.map(l => l.duration).sort((a, b) => a - b)
  const p95Index = Math.floor(durations.length * 0.95)

  const byEndpoint: Record<string, number> = {}
  const byStatus: Record<string, number> = {}

  for (const log of parsedLogs) {
    byEndpoint[log.path] = (byEndpoint[log.path] || 0) + 1
    byStatus[log.statusCode.toString()] = (byStatus[log.statusCode.toString()] || 0) + 1
  }

  return {
    totalRequests: parsedLogs.length,
    errorRate: errors / parsedLogs.length,
    avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
    p95Duration: durations[p95Index] || 0,
    requestsByEndpoint: byEndpoint,
    requestsByStatus: byStatus,
  }
}