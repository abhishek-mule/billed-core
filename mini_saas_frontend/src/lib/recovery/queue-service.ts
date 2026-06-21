import type { RecoveryStateV2, EngagementStateV2 } from '@billzo/shared'

// ============================================================
// QueueItem — Presentation concept wrapping RecoveryCase
// ============================================================

export interface QueueItem {
  rank: number
  caseId: string
  customerId: string
  customer: { name: string; phone: string; tier?: string }
  amount: number
  overdue: number
  reminderCount: number
  recoveryState: string
  engagementState: string
  promiseStatus: 'kept' | 'broken' | 'pending' | null
  lastActivityAt: string | null
  attentionScore: number
  priority: number
  priorityReason: string
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

function computePriority(item: {
  amount: number; overdue: number; engagementState: string; recoveryState: string;
  promiseStatus: string | null; reminderCount: number; tier?: string;
}): { score: number; reason: string } {
  const reasons: string[] = []
  let score = 0

  if (item.promiseStatus === 'broken') { score += 100; reasons.push('Promise broken') }
  else if (item.promiseStatus === 'pending') { score += 20 }

  if (item.overdue > 30) { score += 80; reasons.push('30+ days overdue') }
  else if (item.overdue > 14) { score += 60; reasons.push('14+ days overdue') }
  else if (item.overdue > 7) { score += 50; reasons.push('Over a week overdue') }
  else if (item.overdue > 0) { score += 30 }

  if (item.engagementState === 'ghosting') { score += 40; reasons.push('Ghosting') }
  if (item.recoveryState === 'disputed') { score += 60; reasons.push('Disputed') }

  score += Math.min(item.amount / 1000, 50)

  return { score, reason: reasons.length > 0 ? reasons.join(', ') : 'Routine follow-up' }
}

export function buildQueueItems(
  caseRows: any[],
): { items: QueueItem[]; summary: QueueSummary } {
  const items: QueueItem[] = caseRows
    .filter(r => r.recovery_state_v2 !== 'recovered' && r.recovery_state_v2 !== 'closed')
    .map((r) => {
      const recoveryState = r.recovery_state_v2 || 'active'
      const engagementState = r.engagement_state_v2 || 'unseen'
      const promiseStatus = derivePromiseStatus(r)
      const amount = parseFloat(r.total_outstanding) || 0
      const overdue = parseFloat(r.total_overdue) || 0

      const { score, reason } = computePriority({
        amount, overdue, engagementState, recoveryState,
        promiseStatus: derivePromiseStatus(r),
        reminderCount: r.reminder_count || 0,
        tier: r.customers?.customer_tier,
      })

      return {
        rank: 0,
        caseId: r.id,
        customerId: r.customer_id,
        customer: {
          name: r.customers?.customer_name || 'Unknown',
          phone: r.customers?.phone || '',
          tier: r.customers?.customer_tier || 'regular',
        },
        amount,
        overdue,
        reminderCount: r.reminder_count || 0,
        recoveryState,
        engagementState,
        promiseStatus,
        lastActivityAt: r.last_activity_at || null,
        attentionScore: r.attention_score || 0,
        priority: score,
        priorityReason: reason,
        recommendedAction: getRecommendedAction(recoveryState, engagementState, promiseStatus),
        secondaryActions: getSecondaryActions(recoveryState, engagementState),
      }
    })
    .sort((a, b) => b.priority - a.priority)
    .map((item, i) => ({ ...item, rank: i + 1 }))

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
    actions.push({ id: 'payment_reported', label: 'Mark Paid Offline' })
    actions.push({ id: 'snooze', label: 'Snooze 3d' })
  }

  if (state === 'partial_payment') {
    actions.push({ id: 'send_reminder', label: 'Send Reminder' })
    actions.push({ id: 'payment_reported', label: 'Mark Paid Offline' })
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

export interface PriorityCase {
  caseId: string
  customerId: string
  customerName: string
  phone: string
  totalOverdue: number
  oldestOverdueDays: number
  attentionScore: number
  nextActionType: string
  promiseToPayDate: string | null
  ignoredReminders: number
  brokenPromises: number
  openInvoiceCount: number
  automationMode: 'full_auto' | 'manual' | 'muted'
}

export function buildReason(c: PriorityCase): string {
  const reasons: string[] = []

  if (c.totalOverdue > 50000) reasons.push('High outstanding amount')
  if (c.oldestOverdueDays > 30) reasons.push(`${c.oldestOverdueDays} days overdue`)
  else if (c.oldestOverdueDays > 14) reasons.push(`${c.oldestOverdueDays} days overdue`)
  else if (c.oldestOverdueDays > 7) reasons.push(`${c.oldestOverdueDays} days overdue`)
  if (c.ignoredReminders > 2) reasons.push(`${c.ignoredReminders} reminders ignored`)
  else if (c.ignoredReminders > 0) reasons.push(`${c.ignoredReminders} reminder${c.ignoredReminders > 1 ? 's' : ''} ignored`)
  if (c.brokenPromises > 0) reasons.push(`${c.brokenPromises} payment promise${c.brokenPromises > 1 ? 's' : ''} missed`)
  if (c.nextActionType === 'call' && c.totalOverdue > 100000) reasons.push('Large amount needs personal follow-up')

  return reasons.length > 0 ? reasons.join(' + ') : 'Routine follow-up'
}

export function getNextActionLabel(type: string): string {
  const labels: Record<string, string> = {
    send_reminder: 'Send gentle reminder',
    call: 'Call personally',
    follow_up_call: 'Follow up call',
    wait: 'Wait (promise active)',
    merchant_review: 'Review manually'
  }
  return labels[type] || 'Follow up'
}


