import type { TransportAdapter, OutboundMessage, SendResult } from './types'
import { supabaseAdmin } from '../billzo/supabase-admin'

export class TransportRegistry {
  private adapters = new Map<string, TransportAdapter>()

  register(adapter: TransportAdapter): void {
    if (this.adapters.has(adapter.provider)) {
      console.warn(`[TransportRegistry] Overriding existing adapter for provider: ${adapter.provider}`)
    }
    this.adapters.set(adapter.provider, adapter)
  }

  get(provider: string): TransportAdapter | undefined {
    return this.adapters.get(provider)
  }

  getAll(): TransportAdapter[] {
    return Array.from(this.adapters.values())
  }

  async send(
    channelId: string,
    message: OutboundMessage,
    options?: { provider?: string },
  ): Promise<SendResult> {
    let provider: string | undefined = options?.provider

    if (!provider) {
      const { data: channel } = await supabaseAdmin
        .from('messaging_channels')
        .select('provider')
        .eq('id', channelId)
        .single()
      provider = channel?.provider
    }

    if (!provider) {
      return { success: false, providerMessageId: null, error: `Channel ${channelId} not found`, latencyMs: 0 }
    }

    const adapter = this.adapters.get(provider)
    if (!adapter) {
      return { success: false, providerMessageId: null, error: `No adapter registered for provider: ${provider}`, latencyMs: 0 }
    }

    return adapter.send(channelId, message)
  }

  async getHealth(channelId: string): Promise<import('./types').ChannelHealth | null> {
    const { data: channel } = await supabaseAdmin
      .from('messaging_channels')
      .select('provider, connection_state, last_heartbeat_at, last_connected_at, delivery_success_rate, quality_score')
      .eq('id', channelId)
      .single()

    if (!channel) return null

    const adapter = channel.provider ? this.adapters.get(channel.provider) : undefined
    if (!adapter) {
      return {
        connectionState: channel.connection_state || 'disconnected',
        isConnected: channel.connection_state === 'connected',
        lastHeartbeatAt: channel.last_heartbeat_at,
        lastConnectedAt: channel.last_connected_at,
        deliverySuccessRate: channel.delivery_success_rate,
        qualityScore: channel.quality_score,
        latencyMs: null,
        error: null,
      }
    }

    return adapter.getHealth(channelId)
  }
}
