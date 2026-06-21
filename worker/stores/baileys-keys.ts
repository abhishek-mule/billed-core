// ============================================================
// Baileys Redis-Backed Signal Key Store
// ============================================================
// Implements the SignalKeyStore interface required by Baileys
// AuthenticationState.keys, persisting every key individually
// to Redis. This replaces the in-memory Map-backed store that
// lost its data on JSON serialization.
//
// Key pattern: baileys:keys:{tenantId}:{type}:{id}
// ============================================================

import { getRedis } from '../lib/redis'
import { BufferJSON } from '@whiskeysockets/baileys'

const KEYS_PREFIX = 'baileys:keys:'
const KEYS_TTL = 30 * 24 * 60 * 60

export class RedisBaileysKeyStore {
  private readonly tenantId: string

  constructor(tenantId: string) {
    this.tenantId = tenantId
  }

  private redisKey(type: string, id: string): string {
    return `${KEYS_PREFIX}${this.tenantId}:${type}:${id}`
  }

  async get(type: string, ids: string[]): Promise<Record<string, any>> {
    const redis = getRedis()
    const pipeline = redis.pipeline()
    for (const id of ids) {
      pipeline.get(this.redisKey(type, id))
    }
    const results = await pipeline.exec()
    const data: Record<string, any> = {}
    if (results) {
      for (let i = 0; i < ids.length; i++) {
        const raw = results[i]?.[1] as string | null
        if (raw) {
          try {
            data[ids[i]] = JSON.parse(raw, BufferJSON.reviver)
          } catch {
            data[ids[i]] = null
          }
        }
      }
    }
    return data
  }

  async set(data: Record<string, Record<string, any>>): Promise<void> {
    const redis = getRedis()
    const pipeline = redis.pipeline()
    for (const [type, entries] of Object.entries(data)) {
      for (const [id, value] of Object.entries(entries)) {
        const serialized = JSON.stringify(value, BufferJSON.replacer)
        pipeline.setex(this.redisKey(type, id), KEYS_TTL, serialized)
      }
    }
    await pipeline.exec()
  }

  async has(type: string, ids: string[]): Promise<Record<string, boolean>> {
    const redis = getRedis()
    const pipeline = redis.pipeline()
    for (const id of ids) {
      pipeline.exists(this.redisKey(type, id))
    }
    const results = await pipeline.exec()
    const result: Record<string, boolean> = {}
    if (results) {
      for (let i = 0; i < ids.length; i++) {
        result[ids[i]] = (results[i]?.[1] as number) === 1
      }
    }
    return result
  }

  async delete(ids: string[]): Promise<void> {
    const redis = getRedis()
    const pipeline = redis.pipeline()
    for (const id of ids) {
      const pattern = `${KEYS_PREFIX}${this.tenantId}:*:${id}`
      const keys = await redis.keys(pattern)
      if (keys.length > 0) {
        pipeline.del(...keys)
      }
    }
    await pipeline.exec()
  }
}
