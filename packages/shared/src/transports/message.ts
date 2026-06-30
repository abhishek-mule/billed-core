export type MessageStatus =
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'failed'

export interface Message {
  id: string
  to: string
  body: string
  templateName?: string
  templateParams?: Record<string, string>
  metadata?: Record<string, unknown>
}

export interface MessageResult {
  messageId: string
  providerMessageId?: string
  status: MessageStatus
  error?: string
  occurredAt: string
}

export interface MessageTransport {
  send(message: Message): Promise<MessageResult>
  getStatus(messageId: string): Promise<MessageResult | null>
  name: string
}
