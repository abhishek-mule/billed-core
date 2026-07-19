/**
 * Recovery Intelligence — deterministic recommendation engine.
 *
 * Reads only facts already produced by the frozen platform (recovery_cases,
 * collection_actions, collection_action_events, whatsapp_events, payments).
 * Produces a single explainable recommendation per customer/action:
 *
 *   { action, priority, confidence, reasons[], expectedOutcome }
 *
 * No AI. No LLM. Every output has a concrete reason a merchant can audit.
 * This is Layer 1 of the Merchant Intelligence stack; behavioral learning and
 * an LLM explanation layer are added later, on top of this ground truth.
 */

export type RecommendationAction =
  | 'call'
  | 'send_reminder'
  | 'resend'
  | 'follow_up_call'
  | 'record_payment'
  | 'wait'
  | 'none'

export interface RecommendationInput {
  /** recovery_cases row (or null if only an action is known) */
  rc?: {
    totalOutstanding: number
    totalOverdue: number
    state: string | null
    promiseToPayDate: string | null
    brokenPromises: number
    lastPaymentAt: string | null
    nextActionType: string | null
  } | null
  /** observed signals from whatsapp_events / collection_action_events */
  signals?: {
    lastReminderDeliveredAt?: string | null
    lastReminderReadAt?: string | null
    reminderCount: number
    undeliveredReminders: number
    lastPaymentAmount?: number | null
  }
  /** the action currently being evaluated (optional) */
  action?: { actionType: string; status: string; scheduledAt: string }
  now?: Date
}

export interface Recommendation {
  action: RecommendationAction
  priority: number
  confidence: 'high' | 'medium' | 'low'
  reasons: string[]
  expectedOutcome: string
}

const DAY = 86400000

function daysSince(iso: string | null, now: Date): number | null {
  if (!iso) return null
  return Math.floor((now.getTime() - new Date(iso).getTime()) / DAY)
}

/**
 * Core decision function. Pure and testable.
 */
export function recommend(input: RecommendationInput): Recommendation {
  const now = input.now ?? new Date()
  const rc = input.rc
  const sig = input.signals ?? { reminderCount: 0, undeliveredReminders: 0 }
  const reasons: string[] = []
  let priority = 0

  // 1. Recovered / closed → no action
  if (rc && (rc.state === 'recovered' || rc.state === 'closed')) {
    return {
      action: 'none',
      priority: 0,
      confidence: 'high',
      reasons: ['Account already recovered.'],
      expectedOutcome: 'No action needed.',
    }
  }

  // 2. No outstanding balance → nothing to chase
  if (rc && rc.totalOutstanding <= 0) {
    return {
      action: 'none',
      priority: 0,
      confidence: 'high',
      reasons: ['No outstanding balance.'],
      expectedOutcome: 'No action needed.',
    }
  }

  const promiseBrokenDays =
    rc?.promiseToPayDate != null ? daysSince(rc.promiseToPayDate, now) : null
  const overdueDays = rc ? rc.totalOverdue : 0
  const readRecently = sig.lastReminderReadAt
    ? daysSince(sig.lastReminderReadAt, now)
    : null

  // 3. Broken promise → CALL (highest priority)
  if (promiseBrokenDays != null && promiseBrokenDays > 0) {
    reasons.push(`Payment promise broken ${promiseBrokenDays} day${promiseBrokenDays > 1 ? 's' : ''} ago`)
    priority += 100
  } else if (promiseBrokenDays === 0) {
    reasons.push('Payment promise due today')
    priority += 70
  }

  // 4. Multiple broken promises → escalate confidence of call
  if (rc && rc.brokenPromises > 1) {
    reasons.push(`${rc.brokenPromises} promises already broken`)
    priority += 30
  }

  // 5. Overdue > 30 → call beats another reminder
  if (overdueDays > 30) {
    reasons.push(`Invoice ${overdueDays} days overdue — a call converts better than another reminder`)
    priority += 100
  } else if (overdueDays > 0) {
    reasons.push(`Invoice ${overdueDays} days overdue`)
    priority += 10
  }

  // 6. Reminder read but unpaid → call
  if (readRecently != null && readRecently <= 3 && overdueDays > 0) {
    reasons.push(`Opened the reminder ${readRecently} day${readRecently === 1 ? '' : 's'} ago but hasn't paid`)
    priority += 35
  }

  // 7. Undelivered reminder → resend
  if (sig.undeliveredReminders > 0 && sig.lastReminderDeliveredAt == null) {
    reasons.push('Last reminder was not delivered')
    return {
      action: 'resend',
      priority: Math.max(priority, 80),
      confidence: 'high',
      reasons,
      expectedOutcome: 'Re-deliver the reminder over a working channel.',
    }
  }

  // 8. Promise follow-up due → follow_up_call
  if (input.action?.actionType === 'promise_followup') {
    reasons.push('Promise follow-up is due')
    return {
      action: 'follow_up_call',
      priority: Math.max(priority, 60),
      confidence: 'high',
      reasons,
      expectedOutcome: 'Confirm the promise and re-commit the date.',
    }
  }

  // 9. Decide call vs reminder
  const shouldCall = priority >= 100 || (rc?.nextActionType === 'call')
  const action: RecommendationAction = shouldCall
    ? overdueDays > 0 || rc?.nextActionType === 'call'
      ? 'call'
      : 'send_reminder'
    : 'send_reminder'

  if (action === 'call') {
    reasons.push('A phone call is the highest-converting next step')
  } else if (sig.reminderCount === 0) {
    reasons.push('No reminder sent yet — start with one')
  } else {
    reasons.push('Continue with a reminder')
  }

  // Confidence
  let confidence: Recommendation['confidence'] = 'low'
  if (priority >= 120) confidence = 'high'
  else if (priority >= 70) confidence = 'medium'

  // Expected outcome (deterministic, friendly)
  const expectedOutcome =
    action === 'call'
      ? confidence === 'high'
        ? 'High chance of recovery — calls close overdue accounts fastest.'
        : 'A call usually moves this customer to pay.'
      : 'Reminder keeps the invoice top-of-mind.'

  return { action, priority, confidence, reasons, expectedOutcome }
}

/** Human label for a recommended action. */
export function actionLabel(action: RecommendationAction): string {
  return (
    {
      call: 'Call',
      send_reminder: 'Send Reminder',
      resend: 'Re-send Reminder',
      follow_up_call: 'Follow-up Call',
      record_payment: 'Record Payment',
      wait: 'Wait',
      none: 'No Action',
    } as const
  )[action]
}
