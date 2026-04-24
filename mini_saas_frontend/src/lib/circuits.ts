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

interface CircuitState {
  failures: number
  lastFailure: number
  isOpen: boolean
}

const CIRCUIT_WINDOW = 30000
const CIRCUIT_THRESHOLD = 5
const CIRCUIT_PAUSE = 60000

export async function recordErpFailure(tenantId: string): Promise<void> {
  const redis = getRedis()
  const now = Date.now()
  const key = `circuit:${tenantId}`
  
  const current = await redis.get<CircuitState>(key)
  
  if (!current || now - current.lastFailure > CIRCUIT_WINDOW) {
    await redis.set(key, JSON.stringify({
      failures: 1,
      lastFailure: now,
      isOpen: false,
    }), { ex: 300 })
    return
  }
  
  const newFailures = current.failures + 1
  const isOpen = newFailures >= CIRCUIT_THRESHOLD
  
  await redis.set(key, JSON.stringify({
    failures: newFailures,
    lastFailure: now,
    isOpen,
  }), { ex: isOpen ? CIRCUIT_PAUSE / 1000 : 300 })
}

export async function isCircuitOpen(tenantId: string): Promise<boolean> {
  const redis = getRedis()
  const key = `circuit:${tenantId}`
  
  const state = await redis.get<CircuitState>(key)
  
  if (!state) return false
  
  const now = Date.now()
  
  if (state.isOpen && now - state.lastFailure > CIRCUIT_PAUSE) {
    await redis.set(key, JSON.stringify({
      failures: 0,
      lastFailure: now,
      isOpen: false,
    }), { ex: 300 })
    return false
  }
  
  return state.isOpen
}

export async function recordErpSuccess(tenantId: string): Promise<void> {
  const redis = getRedis()
  const key = `circuit:${tenantId}`
  
  const current = await redis.get<CircuitState>(key)
  
  if (current) {
    await redis.set(key, JSON.stringify({
      failures: 0,
      lastFailure: 0,
      isOpen: false,
    }), { ex: 60 })
  }
}

export async function withCircuitBreaker<T>(
  tenantId: string,
  fn: () => Promise<T>
): Promise<T> {
  const open = await isCircuitOpen(tenantId)
  
  if (open) {
    throw new Error('ERP temporarily unavailable. Please try again in a moment.')
  }
  
  try {
    const result = await fn()
    await recordErpSuccess(tenantId)
    return result
  } catch (error) {
    await recordErpFailure(tenantId)
    throw error
  }
}

export async function getCircuitStatus(tenantId: string): Promise<{ status: 'closed' | 'open' | 'half-open'; failures: number }> {
  const state = await getRedis().get<CircuitState>(`circuit:${tenantId}`)
  
  if (!state) return { status: 'closed', failures: 0 }
  
  if (state.isOpen) return { status: 'open', failures: state.failures }
  
  return { status: 'half-open', failures: state.failures }
}