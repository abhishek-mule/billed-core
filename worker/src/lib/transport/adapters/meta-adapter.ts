import type { TransportAdapter, OutboundMessage, SendResult, ChannelHealth } from '../types'
import type { MetaConfig } from '@billzo/shared'
import { supabaseAdmin } from '../../billzo/supabase-admin'

const DEFAULT_API_VERSION = 'v25.0'
const MESSAGING_PRODUCT = 'whatsapp'

export class MetaAdapter implements TransportAdapter {
  readonly provider = 'meta'

  // Pilot mode (Scenario A): Meta is infrastructure, configured at boot via the
  // bootstrap layer. When set, it takes precedence over per-channel DB config.
  private readonly injectedConfig: MetaConfig | null
  private cachedTemplates: any[] = []

  constructor(config?: MetaConfig) {
    this.injectedConfig =
      config && config.accessToken && config.phoneNumberId
        ? { ...config, apiVersion: config.apiVersion || DEFAULT_API_VERSION }
        : null
  }

  // Boot-time validation. Throws if Meta cannot send. The worker treats a throw
  // here as fatal and refuses to start (no degraded mode).
  async initialize(): Promise<void> {
    if (!this.injectedConfig) {
      throw new Error('MetaAdapter.initialize: META_ACCESS_TOKEN / META_PHONE_NUMBER_ID not configured')
    }
    const cfg = this.injectedConfig

    // 1. Token + phone reachable (graph API rejects bad creds with 401/403)
    const res = await fetch(this.graphUrl(cfg.phoneNumberId, ''), {
      headers: { Authorization: `Bearer ${cfg.accessToken}` },
    })
    if (!res.ok && res.status !== 400) {
      const body = (await res.json().catch(() => ({}))) as any
      const msg = body?.error?.message || `Meta graph returned ${res.status}`
      throw new Error(`MetaAdapter.initialize: ${msg}`)
    }

    // 2. Templates exist on the WABA (used by reminder flow)
    await this.loadTemplates(cfg)

    console.log('[MetaAdapter] initialize: ✓ token valid, ✓ phone reachable, ✓ templates loaded')
  }

  private async loadTemplates(cfg: MetaConfig): Promise<void> {
    const res = await fetch(
      `https://graph.facebook.com/${cfg.apiVersion || DEFAULT_API_VERSION}/${cfg.wabaId}/message_templates`,
      { headers: { Authorization: `Bearer ${cfg.accessToken}` } },
    )
    if (!res.ok) {
      // Non-fatal for boot, but log so operators notice missing templates.
      console.warn('[MetaAdapter] initialize: could not load templates (reminders may fail):', res.status)
      return
    }
    const data = (await res.json().catch(() => ({ data: [] }))) as any
    this.cachedTemplates = Array.isArray(data?.data) ? data.data : []
  }

  get cachedTemplateNames(): string[] {
    return this.cachedTemplates.map((t: any) => t.name as string)
  }

  private async getConfig(channelId: string): Promise<{ accessToken: string; phoneNumberId: string; wabaId: string } | null> {
    // Infrastructure path: config injected at boot — no DB lookup.
    if (this.injectedConfig) {
      return {
        accessToken: this.injectedConfig.accessToken,
        phoneNumberId: this.injectedConfig.phoneNumberId,
        wabaId: this.injectedConfig.wabaId || '',
      }
    }

    // Tenant-owned path (future): read from messaging_channels.
    const { data: channel } = await supabaseAdmin
      .from('messaging_channels')
      .select('config')
      .eq('id', channelId)
      .single()

    if (!channel?.config) return null

    const cfg = channel.config as Record<string, any>
    if (!cfg.accessToken || !cfg.phoneNumberId) return null

    return {
      accessToken: cfg.accessToken as string,
      phoneNumberId: cfg.phoneNumberId as string,
      wabaId: (cfg.wabaId as string) || '',
    }
  }

  private graphUrl(phoneNumberId: string, path: string): string {
    return `https://graph.facebook.com/${DEFAULT_API_VERSION}/${phoneNumberId}${path}`
  }

  private async apiPost(config: { accessToken: string; phoneNumberId: string }, path: string, body: unknown): Promise<any> {
    const res = await fetch(this.graphUrl(config.phoneNumberId, path), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    const data: any = await res.json()
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
