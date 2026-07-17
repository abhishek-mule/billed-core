import type { TransportAdapter, OutboundMessage, SendResult, ChannelHealth } from '../types'
import { supabaseAdmin } from '../../billzo/supabase-admin'

const DEFAULT_API_VERSION = 'v22.0'
const MESSAGING_PRODUCT = 'whatsapp'

export class MetaAdapter implements TransportAdapter {
  readonly provider = 'meta'

  private async getConfig(channelId: string): Promise<{ accessToken: string; phoneNumberId: string; wabaId: string } | null> {
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
