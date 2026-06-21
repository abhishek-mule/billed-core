import type { TransportAdapter, OutboundMessage, SendResult, ChannelHealth, ConnectionState } from '../types'
import { sendViaBaileys, sendBaileysDocument, sendBaileysImage, getBaileysSocket, isBaileysConnected, startBaileysSocket, disconnectBaileys } from '../../../../lib/baileys-socket'
import { getBaileysState } from '../../../../stores/baileys-state'
import { supabaseAdmin } from '../../billzo/supabase-admin'

export class BaileysAdapter implements TransportAdapter {
  readonly provider = 'baileys'

  async send(channelId: string, message: OutboundMessage): Promise<SendResult> {
    const { data: channel } = await supabaseAdmin
      .from('messaging_channels')
      .select('tenant_id')
      .eq('id', channelId)
      .single()

    if (!channel) {
      return { success: false, providerMessageId: null, error: 'Channel not found', latencyMs: 0 }
    }

    const t0 = performance.now()
    const phone = message.to.replace(/\D/g, '')
    const maxRetries = 12
    const retryDelayMs = 2000

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        let result: { messageId: string }

        if (message.document) {
          result = await sendBaileysDocument(channel.tenant_id, phone, message.document.url, message.document.fileName, message.document.caption)
        } else if (message.image) {
          result = await sendBaileysImage(channel.tenant_id, phone, message.image.url, message.image.caption)
        } else {
          result = await sendViaBaileys(channel.tenant_id, phone, message.text)
        }

        return { success: true, providerMessageId: result.messageId, latencyMs: performance.now() - t0 }
      } catch (err: any) {
        const isDisconnected = err.message?.includes('not connected')
        if (!isDisconnected || attempt === maxRetries) {
          return { success: false, providerMessageId: null, error: err.message, latencyMs: performance.now() - t0 }
        }
        console.log(`[BaileysAdapter] Socket not connected (attempt ${attempt}/${maxRetries}), waiting ${retryDelayMs}ms...`)
        await new Promise(resolve => setTimeout(resolve, retryDelayMs))
      }
    }

    return { success: false, providerMessageId: null, error: 'Baileys not connected after retries', latencyMs: performance.now() - t0 }
  }

  async getHealth(channelId: string): Promise<ChannelHealth> {
    const { data: channel } = await supabaseAdmin
      .from('messaging_channels')
      .select('tenant_id')
      .eq('id', channelId)
      .single()

    if (!channel) {
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

    const isConnected = isBaileysConnected(channel.tenant_id)
    const state = await getBaileysState(channel.tenant_id)

    if (state) {
      return {
        connectionState: state.connectionState as ConnectionState,
        isConnected: isConnected,
        lastHeartbeatAt: state.lastHeartbeatAt,
        lastConnectedAt: state.lastConnectedAt,
        deliverySuccessRate: state.deliverySuccessRate,
        qualityScore: null,
        latencyMs: null,
        error: state.error,
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
    const { data: channel } = await supabaseAdmin
      .from('messaging_channels')
      .select('tenant_id')
      .eq('id', channelId)
      .single()

    if (!channel) return

    await startBaileysSocket(channel.tenant_id)
    await supabaseAdmin
      .from('messaging_channels')
      .update({ connection_state: 'connecting', updated_at: new Date().toISOString() })
      .eq('id', channelId)
  }

  async disconnect(channelId: string): Promise<void> {
    const { data: channel } = await supabaseAdmin
      .from('messaging_channels')
      .select('tenant_id')
      .eq('id', channelId)
      .single()

    if (!channel) return

    await disconnectBaileys(channel.tenant_id)
    await supabaseAdmin
      .from('messaging_channels')
      .update({ connection_state: 'disconnected', updated_at: new Date().toISOString() })
      .eq('id', channelId)
  }

  async handleInbound(_payload: unknown): Promise<{ eventType: string; data: Record<string, unknown> } | null> {
    // Baileys inbound processing is handled by the socket event listener
    return null
  }
}
