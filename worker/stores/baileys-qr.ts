import { createRedisConnection } from '../lib/redis'

const QR_PREFIX = 'baileys:qr:'
const QR_TTL = 120

export async function storeQrCode(tenantId: string, qr: string): Promise<void> {
  const redis = createRedisConnection()
  try {
    await redis.setex(`${QR_PREFIX}${tenantId}`, QR_TTL, qr)
  } finally {
    await redis.quit()
  }
}

export async function getQrCode(tenantId: string): Promise<string | null> {
  const redis = createRedisConnection()
  try {
    return await redis.get(`${QR_PREFIX}${tenantId}`)
  } finally {
    await redis.quit()
  }
}

export async function clearQrCode(tenantId: string): Promise<void> {
  const redis = createRedisConnection()
  try {
    await redis.del(`${QR_PREFIX}${tenantId}`)
  } finally {
    await redis.quit()
  }
}
