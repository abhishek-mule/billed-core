import { createRedisConnection } from './redis'

export async function acquireLock(
  key: string,
  ttlMs: number = 30000
): Promise<boolean> {
  const redis = createRedisConnection()
  try {
    const result = await redis.set(`lock:${key}`, '1', 'PX', ttlMs, 'NX')
    return result === 'OK'
  } finally {
    await redis.quit()
  }
}

export async function releaseLock(key: string): Promise<void> {
  const redis = createRedisConnection()
  try {
    await redis.del(`lock:${key}`)
  } finally {
    await redis.quit()
  }
}

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
