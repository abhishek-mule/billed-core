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

export async function recordInvoiceLatency(
  tenantId: string,
  stage: 'reservation' | 'persistence' | 'erp_sync' | 'total',
  durationMs: number
): Promise<void> {
  const redis = getRedis()
  const key = `latency:${stage}:${tenantId}`
  
  const current = await redis.get<number[]>(key) || []
  current.push(durationMs)
  
  const recent = current.slice(-100)
  
  await redis.set(key, recent, { ex: 86400 })
}

export async function getAverageLatency(
  tenantId: string,
  stage: 'reservation' | 'persistence' | 'erp_sync' | 'total'
): Promise<number> {
  const redis = getRedis()
  const key = `latency:${stage}:${tenantId}`
  
  const latencies = await redis.get<number[]>(key) || []
  
  if (latencies.length === 0) return 0
  
  const sum = latencies.reduce((a, b) => a + b, 0)
  return Math.round(sum / latencies.length)
}

export async function getLatencyPercentiles(
  tenantId: string,
  stage: 'reservation' | 'persistence' | 'erp_sync' | 'total'
): Promise<{ p50: number; p95: number; p99: number }> {
  const redis = getRedis()
  const key = `latency:${stage}:${tenantId}`
  
  const latencies = await redis.get<number[]>(key) || []
  
  if (latencies.length === 0) {
    return { p50: 0, p95: 0, p99: 0 }
  }
  
  const sorted = [...latencies].sort((a, b) => a - b)
  
  return {
    p50: sorted[Math.floor(sorted.length * 0.5)],
    p95: sorted[Math.floor(sorted.length * 0.95)],
    p99: sorted[Math.floor(sorted.length * 0.99)],
  }
}

export async function recordErpLatency(
  tenantId: string,
  latencyMs: number
): Promise<void> {
  await recordInvoiceLatency(tenantId, 'erp_sync', latencyMs)
}

class LatencyTracker {
  private startTime: number
  private tenantId: string = ''
  private stage: 'reservation' | 'persistence' | 'erp_sync' | 'total'
  
  constructor(stage: 'reservation' | 'persistence' | 'erp_sync' | 'total') {
    this.startTime = Date.now()
    this.stage = stage
  }
  
  setTenant(tenantId: string) {
    this.tenantId = tenantId
  }
  
  async stop(): Promise<void> {
    if (!this.tenantId) return
    
    const duration = Date.now() - this.startTime
    await recordInvoiceLatency(this.tenantId, this.stage, duration)
  }
}

export function startLatencyTracking(stage: 'reservation' | 'persistence' | 'erp_sync' | 'total'): LatencyTracker {
  return new LatencyTracker(stage)
}