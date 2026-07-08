import { getRedis } from '../lib/redis'

const CODE_PREFIX = 'baileys:code:'
const CODE_TTL = 300

export async function storePairingCode(tenantId: string, code: string): Promise<void> {
  const redis = getRedis()
  await redis.setex(`${CODE_PREFIX}${tenantId}`, CODE_TTL, code)
}

export async function getPairingCode(tenantId: string): Promise<string | null> {
  const redis = getRedis()
  return await redis.get(`${CODE_PREFIX}${tenantId}`)
}

export async function clearPairingCode(tenantId: string): Promise<void> {
  const redis = getRedis()
  await redis.del(`${CODE_PREFIX}${tenantId}`)
}
