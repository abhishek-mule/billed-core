import type { RecoveryStateV2, EngagementStateV2 } from '@billzo/shared'

// ============================================================
// QueueItem — Presentation concept wrapping RecoveryCase
// ============================================================

export interface QueueItem {
  rank: number
  caseId: string
  customerId: string
  customer: { name: string; phone: string }
  amount: number
  overdue: number
  recoveryState: string
  engagementState: string
  promiseStatus: 'kept' | 'broken' | 'pending' | null
  lastActivityAt: string | null
  attentionScore: number
  recommendedAction: {
    id: string
    label: string
  }
  secondaryActions: Array<{ id: string; label: string }>
}

export interface QueueSummary {
  collectibleToday: number
  activeCaseCount: number
  queueSize: number
}

// ============================================================
// Build queue items from raw RecoveryCase rows
// ============================================================

export function buildQueueItems(
  caseRows: any[],
  situationRows: any[],
): { items: QueueItem[]; summary: QueueSummary } {
  const situationsByCustomer = groupSituationsByCustomer(situationRows)

  const items: QueueItem[] = caseRows
    .filter(r => r.recovery_state_v2 !== 'recovered' && r.recovery_state_v2 !== 'closed')
    .map((r, i) => {
      const recoveryState = r.recovery_state_v2 || 'active'
      const engagementState = r.engagement_state_v2 || 'unseen'
      const promiseStatus = derivePromiseStatus(r)

      return {
        rank: i + 1,
        caseId: r.id,
        customerId: r.customer_id,
        customer: {
          name: r.customers?.name || 'Unknown',
          phone: r.customers?.phone || '',
        },
        amount: parseFloat(r.total_outstanding) || 0,
        overdue: parseFloat(r.total_overdue) || 0,
        recoveryState,
        engagementState,
        promiseStatus,
        lastActivityAt: r.last_activity_at || null,
        attentionScore: r.attention_score || 0,
        recommendedAction: getRecommendedAction(recoveryState, engagementState, promiseStatus),
        secondaryActions: getSecondaryActions(recoveryState, engagementState),
      }
    })

  const activeCaseCount = items.length
  const collectibleToday = items.reduce((s, i) => s + i.amount, 0)

  return {
    items,
    summary: {
      collectibleToday,
      activeCaseCount,
      queueSize: items.length,
    },
  }
}

// ============================================================
// Recommended action derivation
// ============================================================

function getRecommendedAction(
  state: string,
  engagement: string,
  promiseStatus: string | null,
): { id: string; label: string } {
  if (state === 'disputed') return { id: 'mark_resolved', label: 'Mark Resolved' }

  if (state === 'promised') {
    if (promiseStatus === 'broken') return { id: 'call', label: 'Call Customer' }
    if (promiseStatus === 'pending') return { id: 'wait', label: 'Waiting for Promise' }
  }

  if (state === 'partial_payment') {
    if (engagement === 'ghosting') return { id: 'call', label: 'Call Customer' }
    return { id: 'record_payment', label: 'Record Payment' }
  }

  if (state === 'overdue') {
    if (engagement === 'ghosting') return { id: 'call', label: 'Call Customer' }
    if (engagement === 'intent') return { id: 'wait', label: 'Link Clicked — Wait' }
    return { id: 'send_reminder', label: 'Send Reminder' }
  }

  if (state === 'active') return { id: 'send_reminder', label: 'Send Reminder' }

  return { id: 'wait', label: 'No Action Needed' }
}

function getSecondaryActions(
  state: string,
  engagement: string,
): Array<{ id: string; label: string }> {
  const actions: Array<{ id: string; label: string }> = []

  if (state === 'disputed') {
    actions.push({ id: 'snooze', label: 'Snooze 3d' })
    return actions
  }

  if (state === 'overdue' || state === 'active') {
    if (engagement !== 'ghosting') actions.push({ id: 'call', label: 'Call' })
    actions.push({ id: 'mark_promise', label: 'Mark Promise' })
    actions.push({ id: 'snooze', label: 'Snooze 3d' })
  }

  if (state === 'partial_payment') {
    actions.push({ id: 'send_reminder', label: 'Send Reminder' })
    actions.push({ id: 'snooze', label: 'Snooze 3d' })
  }

  if (engagement === 'ghosting' && state !== 'disputed') {
    if (!actions.find(a => a.id === 'call')) {
      actions.unshift({ id: 'call', label: 'Call' })
    }
  }

  if (state !== 'disputed') {
    actions.push({ id: 'mark_disputed', label: 'Dispute' })
  }

  return actions
}

// ============================================================
// Helpers
// ============================================================

function derivePromiseStatus(r: any): 'kept' | 'broken' | 'pending' | null {
  if (!r.promise_to_pay_date) return null
  const pDate = new Date(r.promise_to_pay_date)
  const recoveryState = r.recovery_state_v2
  if (recoveryState === 'overdue' && pDate < new Date()) return 'broken'
  if (recoveryState === 'promised') return 'pending'
  if (recoveryState === 'recovered') return 'kept'
  return 'pending'
}

function groupSituationsByCustomer(situations: any[]): Map<string, any[]> {
  const map = new Map<string, any[]>()
  for (const s of situations || []) {
    const customerId = s.customer_id || s.entities?.customers?.[0]
    if (!customerId) continue
    const list = map.get(customerId) || []
    list.push(s)
    map.set(customerId, list)
  }
  return map
}
