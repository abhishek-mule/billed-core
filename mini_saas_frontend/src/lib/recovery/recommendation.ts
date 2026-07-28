import type { RecoveryActivity } from '@/lib/billzo/types'

export type NextActionType =
  | 'send_invoice'
  | 'send_reminder'
  | 'call'
  | 'follow_up_promise'
  | 'update_contact'
  | 'wait'
  | 'paid'
  | 'review'

export type PriorityLevel = 'critical' | 'high' | 'medium' | 'low' | 'done'

export interface NextAction {
  action: NextActionType
  label: string
  description: string
  priority: number
  level: PriorityLevel
}

function priorityLevel(p: number): PriorityLevel {
  if (p === 0) return 'done'
  if (p >= 9) return 'critical'
  if (p >= 6) return 'high'
  if (p >= 3) return 'medium'
  return 'low'
}

function consecutiveNoAnswer(activities: RecoveryActivity[]): number {
  const callOutcomes = activities
    .filter(a => a.type === 'call_outcome')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  let streak = 0
  for (const co of callOutcomes) {
    const outcome = (co.metadata as Record<string, unknown> | undefined)?.outcome
    if (outcome === 'no_answer') streak++
    else break
  }
  return streak
}

export function computeNextAction(activities: RecoveryActivity[], promiseDate?: string | null, outstanding = 0): NextAction {
  const act = (p: number, a: NextActionType, l: string, d: string): NextAction => ({
    action: a, label: l, description: d, priority: p, level: priorityLevel(p),
  })

  if (outstanding <= 0) return act(0, 'paid', 'Paid', 'No outstanding amount')

  if (activities.length === 0) return act(10, 'send_invoice', 'Send Invoice', 'Invoice not yet shared with customer')

  const hasPayment = activities.some(a => a.type === 'payment_received' || a.type === 'payment_confirmed' || a.type === 'customer_payment_reported')
  if (hasPayment) return act(0, 'paid', 'Paid', 'Invoice has been paid')

  const promiseActivity = activities.find(a => a.type === 'promise_received')
  if (promiseActivity) {
    const meta = promiseActivity.metadata as Record<string, unknown> | undefined
    const due = promiseDate || (meta?.dueDate as string | undefined)
    if (due && new Date(due) > new Date()) {
      const days = Math.ceil((new Date(due).getTime() - Date.now()) / 86400000)
      return act(2, 'wait', `Wait ${days}d`, `Customer promised payment by ${new Date(due).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`)
    }
    return act(9, 'follow_up_promise', 'Follow Up Promise', 'Promise overdue — call customer')
  }

  if (activities.some(a => a.type === 'promise_broken')) {
    return act(9, 'call', 'Call Customer', 'Previous promise was broken')
  }

  const lastCallOutcome = activities
    .filter(a => a.type === 'call_outcome')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]

  if (lastCallOutcome) {
    const meta = lastCallOutcome.metadata as Record<string, unknown> | undefined
    const outcome = meta?.outcome as string | undefined
    const daysSinceCall = (Date.now() - new Date(lastCallOutcome.createdAt).getTime()) / 86400000

    if (outcome === 'wrong_number') return act(10, 'update_contact', 'Update Contact', 'Wrong number — update customer phone')

    if (outcome === 'switched_off') {
      if (daysSinceCall < 3) return act(3, 'wait', 'Wait 3d', 'Phone switched off — try later')
      return act(6, 'call', 'Try Again', 'Phone was off — retry')
    }

    if (outcome === 'busy') return act(4, 'wait', 'Wait', 'Line was busy — try later')

    if (outcome === 'no_answer') {
      const streak = consecutiveNoAnswer(activities)
      if (streak >= 3 && daysSinceCall >= 1) return act(8, 'send_reminder', 'Send Reminder', `${streak} consecutive calls unanswered — try WhatsApp`)
      if (daysSinceCall < 1) return act(3, 'wait', 'Wait 1d', 'No answer — try again tomorrow')
      return act(7, 'call', 'Call Again', 'No answer last time')
    }

    if (outcome === 'answered') {
      if (daysSinceCall < 2) return act(1, 'wait', 'Wait 2d', 'Spoke recently — give time')
      const promiseAfterCall = activities.some(
        a => (a.type === 'promise_received' || a.type === 'payment_confirmed') && new Date(a.createdAt) > new Date(lastCallOutcome.createdAt)
      )
      if (!promiseAfterCall) return act(7, 'call', 'Call Again', `Spoke ${Math.round(daysSinceCall)}d ago, no follow-through`)
    }
  } else {
    const lastCall = activities
      .filter(a => a.type === 'merchant_called')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]

    if (lastCall) {
      const daysSinceCall = (Date.now() - new Date(lastCall.createdAt).getTime()) / 86400000
      const promiseAfterCall = activities.some(
        a => (a.type === 'promise_received' || a.type === 'payment_confirmed') && new Date(a.createdAt) > new Date(lastCall.createdAt)
      )
      if (daysSinceCall < 2) return act(1, 'wait', 'Wait 2d', 'Called recently — no outcome recorded')
      if (!promiseAfterCall) return act(6, 'call', 'Call Again', `Called ${Math.round(daysSinceCall)}d ago, no outcome recorded`)
    }
  }

  const lastReminder = activities
    .filter(a => a.type === 'reminder_sent')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]

  if (lastReminder) {
    const daysSince = (Date.now() - new Date(lastReminder.createdAt).getTime()) / 86400000
    const viewedAfter = activities.some(
      a => a.type === 'customer_viewed' && new Date(a.createdAt) > new Date(lastReminder.createdAt)
    )
    if (daysSince >= 3 && !viewedAfter) return act(8, 'call', 'Call Customer', `${Math.round(daysSince)}d since reminder — no response`)
    if (!viewedAfter) return act(6, 'send_reminder', 'Send Reminder', "Customer hasn't opened invoice")
    if (viewedAfter && !promiseActivity) return act(7, 'call', 'Follow Up', 'Customer saw invoice but no response')
  }

  const hasBeenSent = activities.some(a => a.type === 'invoice_sent')
  const hasBeenViewed = activities.some(a => a.type === 'customer_viewed')

  if (hasBeenSent && !hasBeenViewed) {
    const daysSince = (Date.now() - new Date(activities.find(a => a.type === 'invoice_sent')!.createdAt).getTime()) / 86400000
    if (daysSince >= 2) return act(5, 'send_reminder', 'Send Reminder', 'Invoice sent but not viewed')
    return act(1, 'wait', 'Wait', 'Invoice recently sent')
  }

  if (hasBeenViewed && !promiseActivity) return act(6, 'call', 'Follow Up', 'Customer saw invoice but no response')

  return act(3, 'review', 'Review', 'Check customer status')
}
