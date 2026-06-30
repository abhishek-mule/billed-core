import type { LoadRecentActivity } from '@billzo/shared'

export const loadRecentActivity: LoadRecentActivity = async () => {
  const res = await fetch('/api/recovery/queue', { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to load activity')
  const data = await res.json()
  
  return (data.recentEvents || []).map((e: any) => ({
    occurredAt: e.occurredAt,
    eventType: e.eventType,
    reason: e.reason,
    customerName: e.customerName,
    amount: e.amount,
  }))
}