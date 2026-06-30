export interface TimelineEvent {
  id: string
  type: string
  customerId: string
  tenantId: string
  payload: Record<string, unknown>
  occurredAt: string
}

export class FakeTimeline {
  readonly name = 'fake'
  events: TimelineEvent[] = []

  async addEvent(event: Omit<TimelineEvent, 'occurredAt'>): Promise<void> {
    this.events.push({ ...event, occurredAt: new Date().toISOString() })
  }

  getEventsForCustomer(customerId: string): TimelineEvent[] {
    return this.events.filter(e => e.customerId === customerId)
  }

  getEventsByType(type: string): TimelineEvent[] {
    return this.events.filter(e => e.type === type)
  }

  getEventCount(): number {
    return this.events.length
  }

  clear() {
    this.events = []
  }
}
