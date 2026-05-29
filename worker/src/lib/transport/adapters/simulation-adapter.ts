import type { TransportAdapter, OutboundMessage, SendResult, ChannelHealth } from '../types'

export class SimulationAdapter implements TransportAdapter {
  readonly provider = 'simulation'

  async send(_channelId: string, _message: OutboundMessage): Promise<SendResult> {
    const t0 = performance.now()
    return {
      success: true,
      providerMessageId: `sim_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      latencyMs: performance.now() - t0,
    }
  }

  async getHealth(_channelId: string): Promise<ChannelHealth> {
    return {
      connectionState: 'connected',
      isConnected: true,
      lastHeartbeatAt: new Date().toISOString(),
      lastConnectedAt: new Date().toISOString(),
      deliverySuccessRate: 1,
      qualityScore: 1,
      latencyMs: 0,
      error: null,
    }
  }

  async connect(_channelId: string): Promise<void> {}

  async disconnect(_channelId: string): Promise<void> {}

  async handleInbound(_payload: unknown): Promise<{ eventType: string; data: Record<string, unknown> } | null> {
    return null
  }
}
