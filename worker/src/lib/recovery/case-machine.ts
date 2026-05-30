// ============================================================
// case-machine.ts — RecoveryCase State Transition Engine
// ============================================================
//
// Pure computation — no database access.
// The caller is responsible for idempotency checks, persistence,
// and event logging.
//
// Architecture rules:
//   RecoveryState = FACT  (what is true about collection position)
//   EngagementState = BELIEF (behavioral interpretation)
//   Never mix facts and beliefs in the same dimension.

import {
  RecoveryStateV2,
  EngagementStateV2,
  NextActionType,
  RecoveryCaseTransition,
  RECOVERY_STATE_PRECEDENCE,
  computeAttentionScore,
} from '@billzo/shared'

export { RECOVERY_STATE_PRECEDENCE, computeAttentionScore } from '@billzo/shared'

// ============================================================
// Types
// ============================================================

export interface CurrentCase {
  id?: string
  tenantId: string
  customerId: string
  invoiceCount: number
  openInvoiceCount: number
  overdueInvoiceCount: number
  disputedInvoiceCount: number
  promisedInvoiceCount: number
  totalOutstanding: number
  totalOverdue: number
  recoveryState: RecoveryStateV2
  engagementState: EngagementStateV2
  nextActionType: NextActionType | null
  nextActionDueAt: string | null
  lastActivityAt: string | null
  promiseToPayDate: string | null
  attentionScore: number
  version: number
}

export interface SignalEvent {
  type: string
  id: string
  tenantId: string
  customerId: string
  invoiceId?: string | null
  amount?: number | null
  invoiceStatus?: string | null
  dueDate?: string | null
  reminderStage?: string | null
  deliveryStatus?: string | null
  failureCount?: number | null
  merchantAction?: string | null
  occurredAt: string
}

// ============================================================
// Transition: compute the next state given current + signal
// ============================================================

export function transitionCase(
  current: CurrentCase | null,
  signal: SignalEvent,
): RecoveryCaseTransition | null {
  const now = signal.occurredAt || new Date().toISOString()
  const base = current || {
    id: undefined,
    tenantId: signal.tenantId,
    customerId: signal.customerId,
    invoiceCount: 0,
    openInvoiceCount: 0,
    overdueInvoiceCount: 0,
    disputedInvoiceCount: 0,
    promisedInvoiceCount: 0,
    totalOutstanding: 0,
    totalOverdue: 0,
    recoveryState: 'active' as RecoveryStateV2,
    engagementState: 'unseen' as EngagementStateV2,
    nextActionType: null as NextActionType | null,
    nextActionDueAt: null as string | null,
    lastActivityAt: null as string | null,
    promiseToPayDate: null as string | null,
    attentionScore: 0,
    version: 0,
  }

  switch (signal.type) {
    case 'invoice.created':
      return handleInvoiceCreated(base, signal, now)
    case 'invoice.overdue':
      return handleInvoiceOverdue(base, signal, now)
    case 'payment.completed':
      return handlePaymentCompleted(base, signal, now)
    case 'recovery.reminder.sent':
      return handleReminderSent(base, signal, now)
    case 'recovery.reminder.delivered':
      return handleReminderDelivered(base, signal, now)
    case 'recovery.reminder.failed':
      return handleReminderFailed(base, signal, now)
    case 'payment_link.clicked':
      return handleLinkClicked(base, signal, now)
    case 'promise.made':
      return handlePromiseMade(base, signal, now)
    case 'promise.broken':
      return handlePromiseBroken(base, signal, now)
    case 'merchant.mark_disputed':
      return handleMarkDisputed(base, signal, now)
    case 'merchant.mark_closed':
      return handleMarkClosed(base, signal, now)
    default:
      return null
  }
}

// ============================================================
// Signal → Decision helpers
// ============================================================

function buildTransition(
  current: CurrentCase,
  updates: Partial<CurrentCase>,
  eventType: string,
  reason: string,
  trigger: Record<string, unknown>,
  now: string,
): RecoveryCaseTransition {
  const next = { ...current, ...updates, lastActivityAt: now }
  const newState = next.recoveryState
  const oldState = current.recoveryState
  const newEng = next.engagementState
  const oldEng = current.engagementState

  // Recompute attention score
  if (updates.recoveryState !== undefined || updates.engagementState !== undefined || updates.totalOverdue !== undefined) {
    const overdueDays = estimateOverdueDays(next)
    next.attentionScore = computeAttentionScore({
      overdueDays,
      totalOverdue: next.totalOverdue,
      linkClicked: next.engagementState === 'intent' || next.engagementState === 'likely_to_pay',
      promiseBroken: false,
      paymentDetected: next.recoveryState === 'recovered' || next.recoveryState === 'partial_payment',
    })
  }

  // Derive next action
  next.nextActionType = deriveNextAction(next)
  next.nextActionDueAt = deriveNextActionDueAt(next, now)

  const isFirstCase = !current.id
  const fromRecoveryState = isFirstCase ? null : (oldState !== newState ? oldState : undefined)
  const toRecoveryState = isFirstCase ? newState : (oldState !== newState ? newState : undefined)
  const fromEngagementState = isFirstCase ? null : (oldEng !== newEng ? oldEng : undefined)
  const toEngagementState = isFirstCase ? newEng : (oldEng !== newEng ? newEng : undefined)

  return {
    caseId: current.id || '',
    recoveryState: toRecoveryState,
    engagementState: toEngagementState,
    nextActionType: next.nextActionType,
    nextActionDueAt: next.nextActionDueAt,
    attentionScore: next.attentionScore,
    version: current.version + 1,
    event: {
      caseId: current.id || '',
      eventType: eventType as any,
      fromRecoveryState: fromRecoveryState ?? null,
      toRecoveryState: toRecoveryState ?? null,
      fromEngagementState: fromEngagementState ?? null,
      toEngagementState: toEngagementState ?? null,
      reason,
      trigger,
    },
  }
}

// ============================================================
// Event Handlers
// ============================================================

function handleInvoiceCreated(current: CurrentCase, signal: SignalEvent, now: string): RecoveryCaseTransition | null {
  const amount = signal.amount || 0
  return buildTransition(
    current,
    {
      invoiceCount: current.invoiceCount + 1,
      openInvoiceCount: current.openInvoiceCount + 1,
      totalOutstanding: current.totalOutstanding + amount,
      recoveryState: current.recoveryState === 'active' || current.invoiceCount === 0 ? 'active' : current.recoveryState,
    },
    'transition',
    `Invoice created: +${amount}`,
    { signalId: signal.id, invoiceId: signal.invoiceId },
    now,
  )
}

function handleInvoiceOverdue(current: CurrentCase, signal: SignalEvent, now: string): RecoveryCaseTransition {
  const amount = signal.amount || 0
  return buildTransition(
    current,
    {
      overdueInvoiceCount: current.overdueInvoiceCount + 1,
      totalOverdue: current.totalOverdue + amount,
      recoveryState: 'overdue',
    },
    'transition',
    `Invoice overdue: ${signal.invoiceId}`,
    { signalId: signal.id, invoiceId: signal.invoiceId },
    now,
  )
}

function handlePaymentCompleted(current: CurrentCase, signal: SignalEvent, now: string): RecoveryCaseTransition {
  const amount = signal.amount || 0
  const newOutstanding = Math.max(0, current.totalOutstanding - amount)
  const newOpenCount = Math.max(0, current.openInvoiceCount - 1)
  const newOverdue = Math.max(0, current.totalOverdue - amount)
  const isFullPayment = newOutstanding <= 0

  const updates: Partial<CurrentCase> = {
    totalOutstanding: newOutstanding,
    totalOverdue: newOverdue,
    openInvoiceCount: isFullPayment ? 0 : newOpenCount,
    overdueInvoiceCount: isFullPayment ? 0 : Math.max(0, current.overdueInvoiceCount - 1),
  }

  if (isFullPayment) {
    updates.recoveryState = 'recovered'
  } else if (current.recoveryState === 'overdue' || current.recoveryState === 'active') {
    updates.recoveryState = 'partial_payment'
  }

  // Engagement: if was intent, now likely_to_pay
  if (current.engagementState === 'intent') {
    updates.engagementState = 'likely_to_pay'
  }

  return buildTransition(
    current,
    updates,
    'transition',
    isFullPayment ? `Full payment: ${amount}` : `Partial payment: ${amount}, remaining: ${newOutstanding}`,
    { signalId: signal.id, amount, invoiceId: signal.invoiceId },
    now,
  )
}

function handleReminderSent(current: CurrentCase, signal: SignalEvent, now: string): RecoveryCaseTransition {
  return buildTransition(
    current,
    {},
    'transition',
    `Reminder sent: stage=${signal.reminderStage || 'unknown'}`,
    { signalId: signal.id, reminderStage: signal.reminderStage, invoiceId: signal.invoiceId },
    now,
  )
}

function handleReminderDelivered(current: CurrentCase, signal: SignalEvent, now: string): RecoveryCaseTransition {
  const updates: Partial<CurrentCase> = {}
  if (current.engagementState === 'unseen' || current.engagementState === 'ghosting') {
    updates.engagementState = 'engaged'
  }
  return buildTransition(
    current,
    updates,
    'transition',
    'Reminder delivered — customer engaged',
    { signalId: signal.id, deliveryStatus: signal.deliveryStatus },
    now,
  )
}

function handleReminderFailed(current: CurrentCase, signal: SignalEvent, now: string): RecoveryCaseTransition | null {
  const failures = signal.failureCount || 1
  const updates: Partial<CurrentCase> = {}
  if (failures >= 3 && current.engagementState !== 'ghosting') {
    updates.engagementState = 'ghosting'
    return buildTransition(
      current,
      updates,
      'transition',
      `Reminder failed ${failures}x — customer ghosting`,
      { signalId: signal.id, failureCount: failures },
      now,
    )
  }
  // First/second failure — not enough to change state
  return null
}

function handleLinkClicked(current: CurrentCase, signal: SignalEvent, now: string): RecoveryCaseTransition {
  const updates: Partial<CurrentCase> = {}
  if (current.engagementState === 'engaged' || current.engagementState === 'unseen') {
    updates.engagementState = 'intent'
  }
  return buildTransition(
    current,
    updates,
    'transition',
    'Payment link clicked — purchase intent detected',
    { signalId: signal.id },
    now,
  )
}

function handlePromiseMade(current: CurrentCase, signal: SignalEvent, now: string): RecoveryCaseTransition {
  const promiseDate = signal.dueDate || null
  return buildTransition(
    current,
    {
      recoveryState: 'promised',
      promisedInvoiceCount: current.promisedInvoiceCount + 1,
      promiseToPayDate: promiseDate,
    },
    'transition',
    `Promise recorded${promiseDate ? ` by ${promiseDate}` : ''}`,
    { signalId: signal.id },
    now,
  )
}

function handlePromiseBroken(current: CurrentCase, signal: SignalEvent, now: string): RecoveryCaseTransition {
  return buildTransition(
    current,
    {
      recoveryState: 'overdue',
      promisedInvoiceCount: Math.max(0, current.promisedInvoiceCount - 1),
      promiseToPayDate: null,
    },
    'transition',
    'Promise broken — no payment detected by due date',
    { signalId: signal.id },
    now,
  )
}

function handleMarkDisputed(current: CurrentCase, signal: SignalEvent, now: string): RecoveryCaseTransition {
  return buildTransition(
    current,
    {
      recoveryState: 'disputed',
      disputedInvoiceCount: current.disputedInvoiceCount + 1,
    },
    'transition',
    signal.merchantAction ? `Marked disputed: ${signal.merchantAction}` : 'Marked disputed by merchant',
    { signalId: signal.id },
    now,
  )
}

function handleMarkClosed(current: CurrentCase, signal: SignalEvent, now: string): RecoveryCaseTransition {
  return buildTransition(
    current,
    {
      recoveryState: 'closed',
    },
    'transition',
    signal.merchantAction ? `Case closed: ${signal.merchantAction}` : 'Case closed by merchant',
    { signalId: signal.id },
    now,
  )
}

// ============================================================
// Derive next action from state
// ============================================================

function deriveNextAction(c: CurrentCase): NextActionType {
  if (c.recoveryState === 'recovered' || c.recoveryState === 'closed') return 'wait'
  if (c.recoveryState === 'disputed') return 'merchant_review'

  if (c.recoveryState === 'promised') {
    if (c.promiseToPayDate && new Date(c.promiseToPayDate) <= new Date()) {
      return 'send_reminder'
    }
    return 'wait'
  }

  if (c.recoveryState === 'overdue' || c.recoveryState === 'partial_payment') {
    if (c.engagementState === 'ghosting') return 'follow_up_call'
    if (c.engagementState === 'intent') return 'wait'
    return 'send_reminder'
  }

  if (c.recoveryState === 'active') return 'wait'

  return 'wait'
}

function deriveNextActionDueAt(c: CurrentCase, now: string): string | null {
  if (c.nextActionType === 'wait') return null
  if (c.nextActionType === 'send_reminder') return now
  if (c.nextActionType === 'follow_up_call') return now
  if (c.nextActionType === 'merchant_review') return now
  if (c.nextActionType === 'review_payment') return now
  return null
}

// ============================================================
// Helpers
// ============================================================

function estimateOverdueDays(c: CurrentCase): number {
  if (c.totalOverdue <= 0) return 0
  // Rough estimation from attention_score context
  if (c.recoveryState === 'overdue') return 15
  return 0
}
