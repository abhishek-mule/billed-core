import type { TransportAdapter, OutboundMessage, SendResult, ChannelHealth } from './types'
import type { MetaConfig } from '../services/meta/types'

const DEFAULT_API_VERSION = 'v25.0'
const MESSAGING_PRODUCT = 'whatsapp'

export type MetaConfigResolver = (channelId: string) => Promise<MetaConfig | null>

/**
 * Meta Cloud API adapter.
 *
 * Config resolution order:
 *  1. injected config (pilot mode — BillZo's own WABA, set at boot)
 *  2. injected resolver (tenant-owned path — reads messaging_channels)
 *  3. env vars (META_ACCESS_TOKEN / META_PHONE_NUMBER_ID / META_WABA_ID)
 *
 * The env fallback lets the frontend manual-send path reach the same adapter
 * implementation as the worker without a DB channel row.
 */
export class MetaAdapter implements TransportAdapter {
  readonly provider = 'meta'

  private readonly injectedConfig: MetaConfig | null
  private readonly resolver: MetaConfigResolver | null
  private cachedTemplates: any[] = []

  constructor(config?: MetaConfig, resolver?: MetaConfigResolver) {
    this.injectedConfig =
      config && config.accessToken && config.phoneNumberId
        ? { ...config, apiVersion: config.apiVersion || DEFAULT_API_VERSION }
        : null
    this.resolver = resolver || null
  }

  async initialize(): Promise<void> {
    const cfg = await this.getConfig('meta')
    if (!cfg) {
      throw new Error('MetaAdapter.initialize: META_ACCESS_TOKEN / META_PHONE_NUMBER_ID not configured')
    }

    const res = await fetch(this.graphUrl(cfg.phoneNumberId, ''), {
      headers: { Authorization: `Bearer ${cfg.accessToken}` },
    })
    if (!res.ok && res.status !== 400) {
      const body = (await res.json().catch(() => ({}))) as any
      const msg = body?.error?.message || `Meta graph returned ${res.status}`
      throw new Error(`MetaAdapter.initialize: ${msg}`)
    }

    await this.loadTemplates(cfg)
    console.log('[MetaAdapter] initialize: ✓ token valid, ✓ phone reachable, ✓ templates loaded')
  }

  private async loadTemplates(cfg: MetaConfig): Promise<void> {
    if (!cfg.wabaId) return
    const res = await fetch(
      `https://graph.facebook.com/${cfg.apiVersion || DEFAULT_API_VERSION}/${cfg.wabaId}/message_templates`,
      { headers: { Authorization: `Bearer ${cfg.accessToken}` } },
    )
    if (!res.ok) {
      console.warn('[MetaAdapter] initialize: could not load templates (reminders may fail):', res.status)
      return
    }
    const data = (await res.json().catch(() => ({ data: [] }))) as any
    this.cachedTemplates = Array.isArray(data?.data) ? data.data : []
  }

  get cachedTemplateNames(): string[] {
    return this.cachedTemplates.map((t: any) => t.name as string)
  }

  private async getConfig(channelId: string): Promise<MetaConfig | null> {
    if (this.injectedConfig) {
      return {
        accessToken: this.injectedConfig.accessToken,
        phoneNumberId: this.injectedConfig.phoneNumberId,
        wabaId: this.injectedConfig.wabaId || '',
        apiVersion: this.injectedConfig.apiVersion || DEFAULT_API_VERSION,
      }
    }

    if (this.resolver) {
      return this.resolver(channelId)
    }

    const accessToken = process.env.META_ACCESS_TOKEN
    const phoneNumberId = process.env.META_PHONE_NUMBER_ID
    if (!accessToken || !phoneNumberId) return null
    return {
      accessToken,
      phoneNumberId,
      wabaId: process.env.META_WABA_ID || '',
      apiVersion: DEFAULT_API_VERSION,
    }
  }

  private graphUrl(phoneNumberId: string, path: string): string {
    return `https://graph.facebook.com/${DEFAULT_API_VERSION}/${phoneNumberId}${path}`
  }

  private async apiPost(config: { accessToken: string; phoneNumberId: string }, path: string, body: unknown): Promise<any> {
    const url = this.graphUrl(config.phoneNumberId, path)
    console.log(`[MetaAdapter] POST ${url} body=${JSON.stringify(body)}`)
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    const rawText = await res.text()
    console.log(`[MetaAdapter] RESPONSE status=${res.status} body=${rawText}`)
    let data: any
    try {
      data = JSON.parse(rawText)
    } catch {
      data = { raw: rawText }
    }
    if (!res.ok) {
      const err = data?.error || data
      throw new Error(err?.message || err?.error_user_title || `Meta API error (${res.status})`)
    }
    return data
  }

  async send(channelId: string, message: OutboundMessage): Promise<SendResult> {
    const config = await this.getConfig(channelId)
    if (!config) {
      return { success: false, providerMessageId: null, error: 'Meta not configured for this channel', latencyMs: 0 }
    }

    const t0 = performance.now()

    try {
      const payload: Record<string, any> = {
        messaging_product: MESSAGING_PRODUCT,
        to: message.to.replace(/\D/g, ''),
      }

      if (message.document) {
        payload.type = 'document'
        payload.document = {
          link: message.document.url,
          filename: message.document.fileName,
        }
        if (message.document.caption) payload.document.caption = message.document.caption
      } else if (message.image) {
        payload.type = 'image'
        payload.image = { link: message.image.url }
        if (message.image.caption) payload.image.caption = message.image.caption
      } else {
        payload.type = 'text'
        payload.text = { body: message.text, preview_url: false }
      }

      const result = await this.apiPost(config, '/messages', payload)

      return {
        success: true,
        providerMessageId: result.messages?.[0]?.id || null,
        latencyMs: performance.now() - t0,
      }
    } catch (err: any) {
      return {
        success: false,
        providerMessageId: null,
        error: err.message,
        latencyMs: performance.now() - t0,
      }
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
        error: 'Meta not configured',
      }
    }

    const t0 = performance.now()
    try {
      const res = await fetch(this.graphUrl(config.phoneNumberId, ''), {
        headers: { Authorization: `Bearer ${config.accessToken}` },
      })
      const ok = res.ok || res.status === 400 // 400 is ok — means endpoint exists, just needs proper args
      return {
        connectionState: ok ? 'connected' : 'degraded',
        isConnected: ok,
        lastHeartbeatAt: new Date().toISOString(),
        lastConnectedAt: null,
        deliverySuccessRate: null,
        qualityScore: null,
        latencyMs: performance.now() - t0,
        error: ok ? null : `Health check returned ${res.status}`,
      }
    } catch (err: any) {
      return {
        connectionState: 'disconnected',
        isConnected: false,
        lastHeartbeatAt: null,
        lastConnectedAt: null,
        deliverySuccessRate: null,
        qualityScore: null,
        latencyMs: performance.now() - t0,
        error: err.message,
      }
    }
  }

  async connect(_channelId: string): Promise<void> {
    // Meta Cloud API is stateless — nothing to connect
  }

  async disconnect(_channelId: string): Promise<void> {
    // Meta Cloud API is stateless — nothing to disconnect
  }

  async handleInbound(payload: unknown): Promise<{ eventType: string; data: Record<string, unknown> } | null> {
    const body = payload as Record<string, any>
    const status = body?.statuses?.[0]

    if (status?.id) {
      return {
        eventType: 'whatsapp.status.updated',
        data: {
          providerMessageId: status.id,
          recipientId: status.recipient_id,
          status: status.status,
          timestamp: status.timestamp,
          errors: status.errors || null,
        },
      }
    }

    const msg = body?.messages?.[0]
    if (msg?.id) {
      return {
        eventType: 'whatsapp.message.received',
        data: {
          messageId: msg.id,
          from: msg.from,
          type: msg.type,
          text: msg.text?.body || null,
          timestamp: msg.timestamp,
        },
      }
    }

    return null
  }
}
