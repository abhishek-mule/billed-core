import type { OutboxPublisher, OutboxEvent } from './outbox'
import { generateId } from '../utils/ids'

export class FakeOutboxPublisher implements OutboxPublisher {
  readonly name = 'fake'
  private events: Map<string, OutboxEvent> = new Map()
  private failNext = false

  setFailNext(fail: boolean) {
    this.failNext = fail
  }

  async publish(event: Omit<OutboxEvent, 'status' | 'createdAt' | 'processedAt'>): Promise<string> {
    if (this.failNext) {
      this.failNext = false
      throw new Error('Simulated outbox publish failure')
    }

    const id = event.id || generateId()
    const outboxEvent: OutboxEvent = {
      ...event,
      id,
      status: 'pending',
      createdAt: new Date().toISOString(),
    }
    this.events.set(id, outboxEvent)
    return id
  }

  async getStatus(eventId: string): Promise<OutboxEvent | null> {
    return this.events.get(eventId) ?? null
  }

  setStatus(eventId: string, status: OutboxEvent['status']): void {
    const event = this.events.get(eventId)
    if (event) {
      this.events.set(eventId, { ...event, status })
    }
  }

  markProcessed(eventId: string, status: 'processing' | 'processed' | 'dead_letter'): void {
    const event = this.events.get(eventId)
    if (event) {
      this.events.set(eventId, { ...event, status, processedAt: new Date().toISOString() })
    }
  }

  getEvents(): OutboxEvent[] {
    return Array.from(this.events.values())
  }

  getPending(): OutboxEvent[] {
    return this.getEvents().filter(e => e.status === 'pending')
  }

  clear() {
    this.events.clear()
    this.failNext = false
  }
}
