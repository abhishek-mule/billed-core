import { getRedis } from '../lib/redis'

const QR_PREFIX = 'baileys:qr:'
const QR_TTL = 120

export async function storeQrCode(tenantId: string, qr: string): Promise<void> {
  const redis = getRedis()
  await redis.setex(`${QR_PREFIX}${tenantId}`, QR_TTL, qr)
}

export async function getQrCode(tenantId: string): Promise<string | null> {
  const redis = getRedis()
  return await redis.get(`${QR_PREFIX}${tenantId}`)
}

export async function clearQrCode(tenantId: string): Promise<void> {
  const redis = getRedis()
  await redis.del(`${QR_PREFIX}${tenantId}`)
}
