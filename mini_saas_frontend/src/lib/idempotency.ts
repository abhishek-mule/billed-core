import { Redis } from '@upstash/redis'
import crypto from 'crypto'

let redis: Redis | null = null

function getRedis(): Redis | null {
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

const IDEMPOTENCY_TTL = 3600 // 1 hour for onboarding - longer for payments
const LOCK_TTL = 30 // 30 seconds lock for processing

export interface IdempotencyResult<T> {
  isNew: boolean
  result?: T
  status?: 'processing' | 'completed' | 'failed'
}

export interface LockResult {
  acquired: boolean
  lockKey: string
}

export async function acquireLock(
  resource: string,
  identifier: string,
  ttl: number = LOCK_TTL
): Promise<LockResult> {
  const r = getRedis()
  if (!r) {
    return { acquired: true, lockKey: '' } // No Redis = no locking (dev mode)
  }
  
  const lockKey = `lock:${resource}:${identifier}`
  const result = await r.set(lockKey, crypto.randomUUID(), {
    nx: true,
    ex: ttl,
  })
  
  return { acquired: result === 'OK', lockKey }
}

export async function releaseLock(lockKey: string): Promise<void> {
  const r = getRedis()
  if (r && lockKey) {
    await r.del(lockKey)
  }
}

export async function checkIdempotency<T>(
  key: string,
  operation: string
): Promise<IdempotencyResult<T> | null> {
  const r = getRedis()
  if (!r) return null
  
  const idemKey = `idem:${operation}:${key}`
  const existing = await r.get<{ status: string; result?: T; error?: string }>(idemKey)
  
  if (existing) {
    return { 
      isNew: false, 
      result: existing.result,
      status: existing.status as 'processing' | 'completed' | 'failed'
    }
  }
  
  return null
}

export async function startIdempotency(
  key: string,
  operation: string
): Promise<boolean> {
  const r = getRedis()
  if (!r) return true
  
  const idemKey = `idem:${operation}:${key}`
  const result = await r.set(idemKey, { status: 'processing' }, { nx: true, ex: IDEMPOTENCY_TTL })
  
  return result === 'OK'
}

export async function completeIdempotency<T>(
  key: string,
  operation: string,
  result: T
): Promise<void> {
  const r = getRedis()
  if (!r) return
  
  const idemKey = `idem:${operation}:${key}`
  await r.set(idemKey, { status: 'completed', result }, { ex: IDEMPOTENCY_TTL })
}

export async function failIdempotency(
  key: string,
  operation: string,
  error: string
): Promise<void> {
  const r = getRedis()
  if (!r) return
  
  const idemKey = `idem:${operation}:${key}`
  await r.set(idemKey, { status: 'failed', error }, { ex: IDEMPOTENCY_TTL })
}

export async function withIdempotency<T>(
  idempotencyKey: string,
  operation: string,
  handler: () => Promise<T>,
  onConflict?: () => T
): Promise<T> {
  const existing = await checkIdempotency<T>(idempotencyKey, operation)
  
  if (existing) {
    if (existing.status === 'processing') {
      if (onConflict) return onConflict()
      throw new Error('Request already processing - please retry')
    }
    if (existing.status === 'completed' && existing.result) {
      return existing.result
    }
    if (existing.status === 'failed') {
      // Allow retry after failure
    }
  }
  
  const acquired = await startIdempotency(idempotencyKey, operation)
  if (!acquired) {
    // Another request is processing - wait and get result
    await new Promise(resolve => setTimeout(resolve, 1000))
    const result = await checkIdempotency<T>(idempotencyKey, operation)
    if (result?.result) return result.result
    throw new Error('Concurrent request processing')
  }
  
  try {
    const result = await handler()
    await completeIdempotency(idempotencyKey, operation, result)
    return result
  } catch (error) {
    await failIdempotency(idempotencyKey, operation, error instanceof Error ? error.message : 'Unknown error')
    throw error
  }
}

export const IDEMPOTENT_OPERATIONS = {
  onboard: 'onboard',
  createInvoice: 'create_invoice',
  deleteInvoice: 'delete_invoice',
  recordPayment: 'record_payment',
  updateStock: 'update_stock',
  sendWhatsapp: 'send_whatsapp',
} as const

export function generateIdempotencyKey(data: {
  phone?: string
  email?: string
  shopName?: string
}): string {
  const payload = [data.phone, data.email, data.shopName].filter(Boolean).join('|')
  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 32)
}