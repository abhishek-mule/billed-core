import { Redis } from '@upstash/redis'
import { NextResponse } from 'next/server'
import crypto from 'crypto'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

export interface IdempotencyRecord<T = any> {
  status: 'PENDING' | 'COMPLETED' | 'FAILED'
  response?: T
  timestamp: number
}

export const IDEMPOTENT_OPERATIONS = {
  onboard: 'onboard',
  invoice_create: 'invoice_create',
  payment_process: 'payment_process'
}

/**
 * Generates a stable idempotency key from a payload
 */
export function generateIdempotencyKey(payload: any): string {
  const str = JSON.stringify(payload)
  return crypto.createHash('sha256').update(str).digest('hex')
}

/**
 * Acquires a distributed lock using Redis
 */
export async function acquireLock(scope: string, key: string, ttlMs: number = 10000): Promise<{ acquired: boolean, lockKey: string }> {
  const lockKey = `lock:${scope}:${key}`
  const acquired = await redis.set(lockKey, 'locked', { nx: true, px: ttlMs })
  return { acquired: !!acquired, lockKey }
}

/**
 * Releases a distributed lock
 */
export async function releaseLock(lockKey: string): Promise<void> {
  await redis.del(lockKey)
}

/**
 * Advanced withIdempotency supporting generic results and processing callbacks
 */
export async function withIdempotency<T>(
  key: string | null,
  operation: string,
  handler: () => Promise<T>,
  onPending: () => T
): Promise<T> {
  if (!key) {
    return handler()
  }

  const redisKey = `idem:${operation}:${key}`
  
  // 1. Check if key exists
  const existing = await redis.get<IdempotencyRecord<T>>(redisKey)
  
  if (existing) {
    if (existing.status === 'PENDING') {
      return onPending()
    }
    
    if (existing.status === 'COMPLETED' && existing.response) {
      return existing.response
    }
  }

  // 2. Mark as pending
  await redis.set(redisKey, {
    status: 'PENDING',
    timestamp: Date.now(),
  }, { ex: 3600 }) // Expire in 1h for pending

  try {
    // 3. Execute handler
    const result = await handler()
    
    // 4. Record success
    await redis.set(redisKey, {
      status: 'COMPLETED',
      response: result,
      timestamp: Date.now(),
    }, { ex: 3600 * 24 }) // Expire in 24h for completed

    return result
  } catch (error) {
    // 5. Cleanup failure
    await redis.del(redisKey)
    throw error
  }
}