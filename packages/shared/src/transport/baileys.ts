import type { TransportAdapter, OutboundMessage, SendResult, ChannelHealth, ConnectionState } from './types'

export interface BaileysSocketHost {
  sendViaBaileys(tenantId: string, phone: string, text: string): Promise<{ messageId: string }>
  sendBaileysDocument(tenantId: string, phone: string, url: string, fileName: string, caption?: string): Promise<{ messageId: string }>
  sendBaileysImage(tenantId: string, phone: string, url: string, caption?: string): Promise<{ messageId: string }>
  isBaileysConnected(tenantId: string): boolean
  getBaileysState(tenantId: string): Promise<{
    connectionState?: ConnectionState
    lastHeartbeatAt?: string | null
    lastConnectedAt?: string | null
    deliverySuccessRate?: number | null
    error?: string | null
  } | null>
  startBaileysSocket(tenantId: string): Promise<void>
  disconnectBaileys(tenantId: string): Promise<void>
}

export type BaileysTenantResolver = (channelId: string) => Promise<string | null>

/**
 * Baileys (WhatsApp Web protocol) adapter. The socket host and tenant resolver
 * are injected so the adapter stays free of host dependencies.
 */
export class BaileysAdapter implements TransportAdapter {
  readonly provider = 'baileys'

  private readonly socket: BaileysSocketHost
  private readonly resolveTenant: BaileysTenantResolver
  private readonly maxRetries: number
  private readonly retryDelayMs: number

  constructor(
    socket: BaileysSocketHost,
    resolveTenant: BaileysTenantResolver,
    options?: { maxRetries?: number; retryDelayMs?: number },
  ) {
    this.socket = socket
    this.resolveTenant = resolveTenant
    this.maxRetries = options?.maxRetries ?? 12
    this.retryDelayMs = options?.retryDelayMs ?? 2000
  }

  private async getTenant(channelId: string): Promise<string | null> {
    return this.resolveTenant(channelId)
  }

  async send(channelId: string, message: OutboundMessage): Promise<SendResult> {
    const tenantId = await this.getTenant(channelId)
    if (!tenantId) {
      return { success: false, providerMessageId: null, error: 'Channel not found', latencyMs: 0 }
    }

    const t0 = performance.now()
    const phone = message.to.replace(/\D/g, '')
    const maxRetries = this.maxRetries
    const retryDelayMs = this.retryDelayMs

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        let result: { messageId: string }

        if (message.document) {
          result = await this.socket.sendBaileysDocument(tenantId, phone, message.document.url, message.document.fileName, message.document.caption)
        } else if (message.image) {
          result = await this.socket.sendBaileysImage(tenantId, phone, message.image.url, message.image.caption)
        } else {
          result = await this.socket.sendViaBaileys(tenantId, phone, message.text)
        }

        return { success: true, providerMessageId: result.messageId, latencyMs: performance.now() - t0 }
      } catch (err: any) {
        const isDisconnected = err.message?.includes('not connected')
        if (!isDisconnected) {
          return { success: false, providerMessageId: null, error: err.message, latencyMs: performance.now() - t0 }
        }
        if (attempt === maxRetries) {
          return { success: false, providerMessageId: null, error: 'Baileys not connected after retries', latencyMs: performance.now() - t0 }
        }
        console.log(`[BaileysAdapter] Socket not connected (attempt ${attempt}/${maxRetries}), waiting ${retryDelayMs}ms...`)
        await new Promise(resolve => setTimeout(resolve, retryDelayMs))
      }
    }

    return { success: false, providerMessageId: null, error: 'Baileys not connected after retries', latencyMs: performance.now() - t0 }
  }

  async getHealth(channelId: string): Promise<ChannelHealth> {
    const tenantId = await this.getTenant(channelId)
    if (!tenantId) {
      return {
        connectionState: 'disconnected',
        isConnected: false,
        lastHeartbeatAt: null,
        lastConnectedAt: null,
        deliverySuccessRate: null,
        qualityScore: null,
        latencyMs: null,
        error: 'Channel not found',
      }
    }

    const isConnected = this.socket.isBaileysConnected(tenantId)
    const state = await this.socket.getBaileysState(tenantId)

    if (state) {
      return {
        connectionState: state.connectionState || (isConnected ? 'connected' : 'disconnected'),
        isConnected: isConnected,
        lastHeartbeatAt: state.lastHeartbeatAt ?? null,
        lastConnectedAt: state.lastConnectedAt ?? null,
        deliverySuccessRate: state.deliverySuccessRate ?? null,
        qualityScore: null,
        latencyMs: null,
        error: state.error ?? null,
      }
    }

    return {
      connectionState: isConnected ? 'connected' : 'disconnected',
      isConnected,
      lastHeartbeatAt: null,
      lastConnectedAt: null,
      deliverySuccessRate: null,
      qualityScore: null,
      latencyMs: null,
      error: null,
    }
  }

  async connect(channelId: string): Promise<void> {
    const tenantId = await this.getTenant(channelId)
    if (!tenantId) return
    await this.socket.startBaileysSocket(tenantId)
  }

  async disconnect(channelId: string): Promise<void> {
    const tenantId = await this.getTenant(channelId)
    if (!tenantId) return
    await this.socket.disconnectBaileys(tenantId)
  }

  async handleInbound(_payload: unknown): Promise<{ eventType: string; data: Record<string, unknown> } | null> {
    // Baileys inbound processing is handled by the socket event listener
    return null
  }
}
