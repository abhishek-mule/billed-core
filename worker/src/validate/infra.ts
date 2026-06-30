import type { InfraStatus, ValidationContext } from './types'

export async function checkInfra(ctx: ValidationContext): Promise<InfraStatus> {
  const supabase = await checkSupabase(ctx)
  const redis = await checkRedis(ctx)
  const worker = await checkWorkerHealth(ctx)
  const bullmq = worker

  return { supabase, redis, worker, bullmq }
}

async function checkSupabase(ctx: ValidationContext): Promise<boolean> {
  try {
    const response = await fetch(`${ctx.supabaseUrl}/rest/v1/`, {
      headers: { apikey: ctx.supabaseKey },
      signal: AbortSignal.timeout(5000),
    })
    return response.ok
  } catch {
    return false
  }
}

async function checkRedis(ctx: ValidationContext): Promise<boolean> {
  try {
    const { Redis } = await import('ioredis')
    const redis = new Redis(ctx.redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 0,
      connectTimeout: 3000,
    })
    await redis.connect()
    const pong = await redis.ping()
    await redis.quit()
    return pong === 'PONG'
  } catch {
    return false
  }
}

async function checkWorkerHealth(ctx: ValidationContext): Promise<boolean> {
  try {
    const response = await fetch(`${ctx.workerUrl}/health`, {
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) return false
    const body = await response.json() as Record<string, unknown>
    return body.phase === 'RUNNING' || body.status === 'ok' || body.healthy === true
  } catch {
    return false
  }
}
