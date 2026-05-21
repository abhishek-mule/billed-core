import { redis } from './redis'

/**
 * Acquire a distributed lock using Redis.
 * Returns true if lock acquired, false otherwise.
 */
export async function acquireLock(
  key: string,
  ttlMs: number = 30000
): Promise<boolean> {
  const result = await redis.set(`lock:${key}`, '1', {
    nx: true,
    ex: Math.floor(ttlMs / 1000),
  })

  return result === 'OK'
}

/**
 * Release a distributed lock.
 */
export async function releaseLock(key: string): Promise<void> {
  await redis.del(`lock:${key}`)
}

/**
 * Execute a function with a distributed lock.
 * If lock cannot be acquired, returns null.
 */
export async function withLock<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>
): Promise<T | null> {
  const acquired = await acquireLock(key, ttlMs)
  if (!acquired) return null

  try {
    return await fn()
  } finally {
    await releaseLock(key)
  }
}
