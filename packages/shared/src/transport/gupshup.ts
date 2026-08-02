import type { TransportAdapter, OutboundMessage, SendResult, ChannelHealth, ConnectionState } from './types'

export interface GupshupChannelConfig {
  apiKey: string
  appName: string
  sourceNumber: string
}

export type GupshupConfigResolver = (channelId: string) => Promise<GupshupChannelConfig | null>

export interface CircuitBreakerStore {
  get(key: string): Promise<string | null>
  setex(key: string, ttlSec: number, value: string): Promise<void>
  del(key: string): Promise<void>
}

const CIRCUIT_THRESHOLD = 5
const CIRCUIT_TTL = 3600

/**
 * Gupshup REST API adapter. Config resolution and the circuit-breaker store are
 * injected so the adapter stays free of host dependencies (DB client, Redis).
 */
export class GupshupAdapter implements TransportAdapter {
  readonly provider = 'gupshup'

  private readonly configResolver: GupshupConfigResolver
  private readonly circuit: CircuitBreakerStore

  constructor(options?: { configResolver?: GupshupConfigResolver; circuitBreaker?: CircuitBreakerStore }) {
    this.configResolver = options?.configResolver || (async () => null)
    this.circuit = options?.circuitBreaker || new InMemoryCircuitBreaker()
  }

  private async getConfig(channelId: string): Promise<GupshupChannelConfig | null> {
    return this.configResolver(channelId)
  }

  async send(channelId: string, message: OutboundMessage): Promise<SendResult> {
    const config = await this.getConfig(channelId)
    if (!config) {
      return { success: false, providerMessageId: null, error: 'Gupshup not configured for this channel', latencyMs: 0 }
    }

    const isOpen = await this.isCircuitOpen(channelId)
    if (isOpen) {
      return { success: false, providerMessageId: null, error: 'Circuit breaker open', latencyMs: 0 }
    }

    const t0 = performance.now()

    try {
      const body: Record<string, any> = {
        channel: 'whatsapp',
        source: config.sourceNumber,
        destination: message.to.replace(/\D/g, ''),
        message: { text: message.text },
        'src.name': config.appName,
      }

      if (message.document) {
        body.message = { type: 'document', url: message.document.url, filename: message.document.fileName }
      }

      const res = await fetch(`https://api.gupshup.io/sm/api/v1/msg`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Cache-Control': 'no-cache',
          apikey: config.apiKey,
        },
        body: new URLSearchParams(
          Object.fromEntries(Object.entries(body).map(([k, v]) => [k, String(v)])),
        ).toString(),
      })

      const data = (await res.json().catch(() => ({}))) as Record<string, any>

      if (!res.ok) {
        await this.recordSendFailure(channelId)
        return { success: false, providerMessageId: null, error: data.message || data.error || 'Gupshup API error', latencyMs: performance.now() - t0 }
      }

      await this.recordSendSuccess(channelId)
      return { success: true, providerMessageId: data.messageId || String(data.id || ''), latencyMs: performance.now() - t0 }
    } catch (err: any) {
      await this.recordSendFailure(channelId)
      return { success: false, providerMessageId: null, error: err.message, latencyMs: performance.now() - t0 }
    }
  }

  async getHealth(channelId: string): Promise<ChannelHealth> {
    const config = await this.getConfig(channelId)
    if (!config) {
      return {
        connectionState: 'disconnected',
        isConnected: false,
        lastHeartbeatAt: null,
        lastConnectedAt: null,
        deliverySuccessRate: null,
        qualityScore: null,
        latencyMs: null,
        error: 'Gupshup not configured',
      }
    }

    const t0 = performance.now()
    try {
      const res = await fetch(`https://api.gupshup.io/sm/api/v1/app/settings`, {
        headers: { apikey: config.apiKey },
      })
      if (res.ok) {
        return {
          connectionState: 'connected',
          isConnected: true,
          lastHeartbeatAt: new Date().toISOString(),
          lastConnectedAt: null,
          deliverySuccessRate: null,
          qualityScore: null,
          latencyMs: performance.now() - t0,
          error: null,
        }
      }
      return {
        connectionState: 'degraded',
        isConnected: false,
        lastHeartbeatAt: null,
        lastConnectedAt: null,
        deliverySuccessRate: null,
        qualityScore: null,
        latencyMs: performance.now() - t0,
        error: 'API returned non-OK status',
      }
    } catch {
      return {
        connectionState: 'disconnected',
        isConnected: false,
        lastHeartbeatAt: null,
        lastConnectedAt: null,
        deliverySuccessRate: null,
        qualityScore: null,
        latencyMs: null,
        error: 'Health check failed',
      }
    }
  }

  async connect(_channelId: string): Promise<void> {
  }

  async disconnect(_channelId: string): Promise<void> {
  }

  async handleInbound(payload: unknown): Promise<{ eventType: string; data: Record<string, unknown> } | null> {
    const body = payload as Record<string, any>
    if (body?.type === 'message-event' && body?.payload?.id) {
      return {
        eventType: 'whatsapp.status.updated',
        data: {
          providerMessageId: body.payload.id,
          status: body.payload.type === 'failed' ? 'failed' : body.payload.type === 'read' ? 'read' : 'delivered',
          timestamp: body.timestamp || new Date().toISOString(),
        },
      }
    }
    return null
  }

  private async isCircuitOpen(channelId: string): Promise<boolean> {
    try {
      const raw = await this.circuit.get(`circuit:gupshup:${channelId}`)
      if (!raw) return false
      const state = JSON.parse(raw)
      return state.failures >= CIRCUIT_THRESHOLD
    } catch {
      return false
    }
  }

  private async recordSendSuccess(channelId: string): Promise<void> {
    try {
      await this.circuit.del(`circuit:gupshup:${channelId}`)
    } catch { /* non-critical */ }
  }

  private async recordSendFailure(channelId: string): Promise<void> {
    try {
      const key = `circuit:gupshup:${channelId}`
      const raw = await this.circuit.get(key)
      const state = raw ? JSON.parse(raw) : { failures: 0 }
      state.failures = (state.failures || 0) + 1
      await this.circuit.setex(key, CIRCUIT_TTL, JSON.stringify(state))
    } catch { /* non-critical */ }
  }
}

class InMemoryCircuitBreaker implements CircuitBreakerStore {
  private store = new Map<string, { value: string; expiresAt: number }>()

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key)
    if (!entry) return null
    if (entry.expiresAt < Date.now()) {
      this.store.delete(key)
      return null
    }
    return entry.value
  }

  async setex(key: string, ttlSec: number, value: string): Promise<void> {
    this.store.set(key, { value, expiresAt: Date.now() + ttlSec * 1000 })
  }

  async del(key: string): Promise<void> {
    this.store.delete(key)
  }
}

export type { ConnectionState }
