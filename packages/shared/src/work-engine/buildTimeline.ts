import type { TimelineItem } from './types'

export interface TimelineEventInput {
  id: string
  type: 'reminder' | 'promise' | 'payment' | 'call' | 'system'
  label: string
  detail: string
  amount?: number
  occurredAt: string
}

export function buildTimeline(events: TimelineEventInput[]): TimelineItem[] {
  return events
    .map(e => ({
      date: e.occurredAt,
      type: e.type,
      label: e.label,
      detail: e.detail,
      amount: e.amount,
    }))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}
