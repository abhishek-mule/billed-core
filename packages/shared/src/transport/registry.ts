import type { TransportAdapter, OutboundMessage, SendResult, ChannelHealth } from './types'

/**
 * Resolves the provider name for a channel id. Injected by the host
 * (worker or frontend) so this package stays free of DB client imports.
 */
export type ProviderResolver = (channelId: string) => Promise<string | null>

export class TransportRegistry {
  private adapters = new Map<string, TransportAdapter>()

  constructor(private readonly resolveProvider?: ProviderResolver) {}

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

    if (!provider && this.resolveProvider) {
      provider = (await this.resolveProvider(channelId)) || undefined
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

  async getHealth(channelId: string): Promise<ChannelHealth | null> {
    const provider = this.resolveProvider ? (await this.resolveProvider(channelId)) || null : null
    if (!provider) return null

    const adapter = this.adapters.get(provider)
    if (!adapter) {
      return {
        connectionState: 'disconnected',
        isConnected: false,
        lastHeartbeatAt: null,
        lastConnectedAt: null,
        deliverySuccessRate: null,
        qualityScore: null,
        latencyMs: null,
        error: `No adapter registered for provider: ${provider}`,
      }
    }

    return adapter.getHealth(channelId)
  }
}
