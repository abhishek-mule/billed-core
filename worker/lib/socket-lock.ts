import { getRedis } from './redis'

const LOCK_TTL = 60_000
const RENEW_INTERVAL = 30_000
const LOCK_PREFIX = 'baileys:lock:'

const renewalTimers = new Map<string, ReturnType<typeof setInterval>>()

export async function acquireSocketLock(tenantId: string): Promise<boolean> {
  const redis = getRedis()
  const acquired = await redis.set(
    `${LOCK_PREFIX}${tenantId}`,
    process.pid.toString(),
    'PX',
    LOCK_TTL,
    'NX',
  )
  return acquired !== null
}

export async function releaseSocketLock(tenantId: string): Promise<void> {
  const timer = renewalTimers.get(tenantId)
  if (timer) {
    clearInterval(timer)
    renewalTimers.delete(tenantId)
  }

  const redis = getRedis()
  const val = await redis.get(`${LOCK_PREFIX}${tenantId}`)
  if (val === process.pid.toString()) {
    await redis.del(`${LOCK_PREFIX}${tenantId}`)
  }
}

export function startLockRenewal(tenantId: string): void {
  const timer = setInterval(async () => {
    const redis = getRedis()
    const val = await redis.get(`${LOCK_PREFIX}${tenantId}`)
    if (val === process.pid.toString()) {
      await redis.pexpire(`${LOCK_PREFIX}${tenantId}`, LOCK_TTL)
    }
  }, RENEW_INTERVAL)

  renewalTimers.set(tenantId, timer)
}

export function stopAllRenewals(): void {
  for (const [tenantId, timer] of renewalTimers) {
    clearInterval(timer)
  }
  renewalTimers.clear()
}
