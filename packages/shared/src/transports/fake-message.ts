import type { MessageTransport, Message, MessageResult, MessageStatus } from './message'

export class FakeMessageTransport implements MessageTransport {
  readonly name = 'fake'
  private sent: Map<string, { message: Message; result: MessageResult }> = new Map()
  private failNext = false
  private simulateDelayMs = 0

  setSimulateDelay(ms: number) {
    this.simulateDelayMs = ms
  }

  setFailNext(fail: boolean) {
    this.failNext = fail
  }

  async send(message: Message): Promise<MessageResult> {
    if (this.simulateDelayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, this.simulateDelayMs))
    }

    if (this.failNext) {
      this.failNext = false
      const result: MessageResult & { status: MessageStatus } = {
        messageId: message.id,
        status: 'failed',
        error: 'Simulated failure',
        occurredAt: new Date().toISOString(),
      }
      this.sent.set(message.id, { message, result })
      return result
    }

    const result: MessageResult = {
      messageId: message.id,
      providerMessageId: `fake-${message.id}`,
      status: 'delivered',
      occurredAt: new Date().toISOString(),
    }
    this.sent.set(message.id, { message, result })
    return result
  }

  async getStatus(messageId: string): Promise<MessageResult | null> {
    const entry = this.sent.get(messageId)
    return entry?.result ?? null
  }

  getSentMessages(): { message: Message; result: MessageResult }[] {
    return Array.from(this.sent.values())
  }

  getSentCount(): number {
    return this.sent.size
  }

  clear() {
    this.sent.clear()
    this.failNext = false
    this.simulateDelayMs = 0
  }
}
