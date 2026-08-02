import { GupshupAdapter, BaileysAdapter } from '@billzo/shared'
import type { BaileysSocketHost, CircuitBreakerStore } from '@billzo/shared'
import { supabaseAdmin } from '../billzo/supabase-admin'
import { getRedis } from '../../../lib/redis'
import {
  sendViaBaileys,
  sendBaileysDocument,
  sendBaileysImage,
  isBaileysConnected,
  startBaileysSocket,
  disconnectBaileys,
} from '../../../lib/baileys-socket'
import { getBaileysState } from '../../../stores/baileys-state'

class RedisCircuitBreaker implements CircuitBreakerStore {
  async get(key: string): Promise<string | null> {
    try {
      const redis = getRedis()
      return await redis.get(key)
    } catch {
      return null
    }
  }

  async setex(key: string, ttlSec: number, value: string): Promise<void> {
    try {
      const redis = getRedis()
      await redis.setex(key, ttlSec, value)
    } catch { /* non-critical */ }
  }

  async del(key: string): Promise<void> {
    try {
      const redis = getRedis()
      await redis.del(key)
    } catch { /* non-critical */ }
  }
}

const baileysSocketHost: BaileysSocketHost = {
  sendViaBaileys: (tenantId, phone, text) => sendViaBaileys(tenantId, phone, text),
  sendBaileysDocument: (tenantId, phone, url, fileName, caption) =>
    sendBaileysDocument(tenantId, phone, url, fileName, caption),
  sendBaileysImage: (tenantId, phone, url, caption) => sendBaileysImage(tenantId, phone, url, caption),
  isBaileysConnected: (tenantId) => isBaileysConnected(tenantId),
  getBaileysState: async (tenantId) => getBaileysState(tenantId),
  startBaileysSocket: (tenantId) => startBaileysSocket(tenantId),
  disconnectBaileys: (tenantId) => disconnectBaileys(tenantId),
}

async function resolveBaileysTenant(channelId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('messaging_channels')
    .select('tenant_id')
    .eq('id', channelId)
    .single()
  return data?.tenant_id ?? null
}

async function resolveGupshupConfig(channelId: string) {
  const { data: channel } = await supabaseAdmin
    .from('messaging_channels')
    .select('config')
    .eq('id', channelId)
    .single()

  if (!channel?.config) return null

  const cfg = channel.config as Record<string, any>
  if (!cfg.gupshupApiKey || !cfg.gupshupAppName || !cfg.sourceNumber) return null

  return {
    apiKey: cfg.gupshupApiKey as string,
    appName: cfg.gupshupAppName as string,
    sourceNumber: cfg.sourceNumber as string,
  }
}

export function createWorkerGupshupAdapter(): GupshupAdapter {
  return new GupshupAdapter({
    configResolver: resolveGupshupConfig,
    circuitBreaker: new RedisCircuitBreaker(),
  })
}

export function createWorkerBaileysAdapter(): BaileysAdapter {
  return new BaileysAdapter(baileysSocketHost, resolveBaileysTenant)
}
