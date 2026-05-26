import { createRedisConnection } from '../lib/redis'
import type { AuthenticationState, SignalDataTypeMap } from '@whiskeysockets/baileys'
import { BufferJSON } from '@whiskeysockets/baileys'

const AUTH_PREFIX = 'baileys:auth:'
const AUTH_TTL = 30 * 24 * 60 * 60

export async function getBaileysAuthState(tenantId: string): Promise<AuthenticationState | null> {
  const redis = createRedisConnection()
  try {
    const raw = await redis.get(`${AUTH_PREFIX}${tenantId}`)
    if (!raw) return null
    return JSON.parse(raw, BufferJSON.reviver) as AuthenticationState
  } finally {
    await redis.quit()
  }
}

export async function saveBaileysAuthState(tenantId: string, state: AuthenticationState): Promise<void> {
  const redis = createRedisConnection()
  try {
    const raw = JSON.stringify(state, BufferJSON.replacer)
    await redis.setex(`${AUTH_PREFIX}${tenantId}`, AUTH_TTL, raw)
  } finally {
    await redis.quit()
  }
}

export async function deleteBaileysAuthState(tenantId: string): Promise<void> {
  const redis = createRedisConnection()
  try {
    await redis.del(`${AUTH_PREFIX}${tenantId}`)
  } finally {
    await redis.quit()
  }
}

export async function hasBaileysAuth(tenantId: string): Promise<boolean> {
  const redis = createRedisConnection()
  try {
    const exists = await redis.exists(`${AUTH_PREFIX}${tenantId}`)
    return exists === 1
  } finally {
    await redis.quit()
  }
}
