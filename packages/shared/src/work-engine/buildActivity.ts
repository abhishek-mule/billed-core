import type { ActivityItem, WorkContext } from './types'

export interface ActivityEventInput {
  occurredAt: string
  eventType?: string
  reason?: string
  customerName?: string
  amount?: number
}

export function buildActivity(events: ActivityEventInput[], _context: WorkContext): ActivityItem[] {
  return events.map(e => {
    const label = (e.reason || e.eventType || 'Activity recorded')
      .replace(/_/g, ' ')
      .replace(/\brecovery\b/gi, 'Udhar')
      .replace(/\bqueue\b/gi, 'work')

    const detail = e.customerName
      ? `${e.customerName}${e.amount ? ` — ${formatAmount(e.amount)}` : ''}`
      : ''

    return {
      occurredAt: e.occurredAt,
      label,
      detail,
    }
  }).sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
}

function formatAmount(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount)
}