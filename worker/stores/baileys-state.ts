import { getRedis } from '../lib/redis'

const STATE_PREFIX = 'baileys:state:'
const STATE_TTL = 86400

export interface BaileysConnectionState {
  connectionState: 'connecting' | 'connected' | 'degraded' | 'reconnecting' | 'disconnected' | 'banned' | 'auth_expired'
  lastHeartbeatAt: string | null
  lastConnectedAt: string | null
  qrGeneratedAt: string | null
  error: string | null
  deliverySuccessRate: number | null
}

export async function setBaileysState(tenantId: string, state: Partial<BaileysConnectionState>): Promise<void> {
  const redis = getRedis()
  const key = `${STATE_PREFIX}${tenantId}`
  const existing = await redis.get(key)
  const current: BaileysConnectionState = existing
    ? { ...JSON.parse(existing), ...state }
    : {
        connectionState: 'disconnected',
        lastHeartbeatAt: null,
        lastConnectedAt: null,
        qrGeneratedAt: null,
        error: null,
        deliverySuccessRate: null,
        ...state,
      }
  await redis.setex(key, STATE_TTL, JSON.stringify(current))
}

export async function getBaileysState(tenantId: string): Promise<BaileysConnectionState | null> {
  const redis = getRedis()
  const raw = await redis.get(`${STATE_PREFIX}${tenantId}`)
  return raw ? JSON.parse(raw) : null
}

export async function clearBaileysState(tenantId: string): Promise<void> {
  const redis = getRedis()
  await redis.del(`${STATE_PREFIX}${tenantId}`)
}
