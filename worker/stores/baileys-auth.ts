// ============================================================
// Baileys Auth State — Redis-backed credentials persistence
// ============================================================
// Stores creds (AuthenticationCreds) separately from signal keys.
// Creds are small and stored as a single Redis key.
// Signal keys are stored individually via RedisBaileysKeyStore.
//
// This split ensures keys survive JSON round-trips and can be
// reconstructed after worker restart without data loss.
// ============================================================

import { getRedis } from '../lib/redis'
import type { AuthenticationCreds } from '@whiskeysockets/baileys'
import { BufferJSON } from '@whiskeysockets/baileys'

const CREDS_PREFIX = 'baileys:creds:'
const CREDS_TTL = 30 * 24 * 60 * 60

export async function getBaileysCreds(tenantId: string): Promise<AuthenticationCreds | null> {
  const redis = getRedis()
  try {
    const raw = await redis.get(`${CREDS_PREFIX}${tenantId}`)
    if (!raw) return null
    const parsed = JSON.parse(raw, BufferJSON.reviver) as AuthenticationCreds
    if (!parsed || !parsed.registrationId) {
      console.warn(`[BaileysAuth] Found invalid creds for ${tenantId}, discarding.`)
      return null
    }
    return parsed
  } catch (e) {
    console.error(`[BaileysAuth] Error parsing creds for ${tenantId}`, e)
    return null
  }
}

export async function saveBaileysCreds(tenantId: string, creds: AuthenticationCreds): Promise<void> {
  const redis = getRedis()
  const raw = JSON.stringify(creds, BufferJSON.replacer)
  await redis.setex(`${CREDS_PREFIX}${tenantId}`, CREDS_TTL, raw)
}

export async function hasBaileysAuth(tenantId: string): Promise<boolean> {
  const redis = getRedis()
  const exists = await redis.exists(`${CREDS_PREFIX}${tenantId}`)
  return exists === 1
}

export async function deleteBaileysAuthState(tenantId: string): Promise<void> {
  const redis = getRedis()
  const credsKey = `${CREDS_PREFIX}${tenantId}`
  await redis.del(credsKey)

  const keysPrefix = `baileys:keys:${tenantId}:*`
  const keys = await redis.keys(keysPrefix)
  if (keys.length > 0) {
    await redis.del(...keys)
  }
}
