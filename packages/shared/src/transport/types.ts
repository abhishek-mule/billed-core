export type ConnectionState =
  | 'connecting'
  | 'connected'
  | 'degraded'
  | 'rate_limited'
  | 'reconnecting'
  | 'auth_expired'
  | 'disconnected'
  | 'banned'
  | 'shadow'

export interface OutboundMessage {
  to: string
  text: string
  document?: { url: string; fileName: string; caption?: string }
  image?: { url: string; caption?: string }
  providerMessageId?: string
}

export interface SendResult {
  success: boolean
  providerMessageId: string | null
  error?: string
  latencyMs: number
}

export interface ChannelHealth {
  connectionState: ConnectionState
  isConnected: boolean
  lastHeartbeatAt: string | null
  lastConnectedAt: string | null
  deliverySuccessRate: number | null
  qualityScore: number | null
  latencyMs: number | null
  error: string | null
}

export interface TransportAdapter {
  readonly provider: string

  send(channelId: string, message: OutboundMessage): Promise<SendResult>

  getHealth(channelId: string): Promise<ChannelHealth>

  connect(channelId: string, config: Record<string, unknown>): Promise<void>

  disconnect(channelId: string): Promise<void>

  handleInbound(payload: unknown): Promise<{ eventType: string; data: Record<string, unknown> } | null>
}
