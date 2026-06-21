// ============================================================
// RecoveryCase — Canonical Collection Position Aggregate Root
// ============================================================
//
// RecoveryState = FACT (what is true about the collection position)
// EngagementState = BELIEF (behavioral interpretation)
//
// Never mix facts and beliefs.

// ============================================================
// RECOVERY STATE — Factual collection position
// ============================================================
// Precedence order (higher = overrides lower when deriving from invoices):
//   closed > recovered > disputed > promised > partial_payment > overdue > active

export const RECOVERY_STATES_V2 = [
  'active',           // invoices exist, no red flags
  'overdue',          // at least one invoice past due_date
  'partial_payment',  // some invoices paid, some still open
  'promised',         // merchant recorded a promise-to-pay
  'recovered',        // all invoices paid
  'disputed',         // merchant marked as disputed
  'closed',           // manually closed or written off
] as const

export type RecoveryStateV2 = (typeof RECOVERY_STATES_V2)[number]

// Precedence map: higher index = higher precedence
export const RECOVERY_STATE_PRECEDENCE: Record<RecoveryStateV2, number> = {
  active: 0,
  overdue: 1,
  partial_payment: 2,
  promised: 3,
  disputed: 4,
  recovered: 5,
  closed: 6,
}

// ============================================================
// ENGAGEMENT STATE — Behavioral interpretation
// ============================================================

export const ENGAGEMENT_STATES_V2 = [
  'unseen',        // no reminder response detected
  'engaged',       // opened/read reminders
  'intent',        // clicked payment link
  'likely_to_pay', // positive payment behavior pattern
  'ghosting',      // repeated non-response after engagement
  'snoozed',       // merchant manually paused automation
] as const

export type EngagementStateV2 = (typeof ENGAGEMENT_STATES_V2)[number]

// ============================================================
// NEXT ACTION TYPE — System recommendation
// ============================================================

export const NEXT_ACTION_TYPES = [
  'send_reminder',
  'review_payment',
  'follow_up_call',
  'wait',
  'merchant_review',
] as const

export type NextActionType = (typeof NEXT_ACTION_TYPES)[number]

// ============================================================
// RECOVERY CASE — Aggregate root
// ============================================================

export interface RecoveryCase {
  id: string
  tenantId: string
  customerId: string

  // Aggregate counts (not invoice_ids[])
  invoiceCount: number
  openInvoiceCount: number
  overdueInvoiceCount: number
  disputedInvoiceCount: number
  promisedInvoiceCount: number

  // Financial
  totalOutstanding: number
  totalOverdue: number

  // State (v2 — dual-write)
  recoveryState: RecoveryStateV2
  engagementState: EngagementStateV2

  // Next action
  nextActionType: NextActionType | null
  nextActionDueAt: string | null

  // Activity
  lastActivityAt: string | null

  // Promise tracking
  promiseToPayDate: string | null

  // Ranking (deterministic, not ML)
  attentionScore: number

  // Optimistic concurrency
  version: number

  // Timestamps
  createdAt: string
  updatedAt: string
}

// ============================================================
// RECOVERY CASE EVENT — Append-only decision log entry
// ============================================================
// Stores SYSTEM DECISIONS (what the state machine concluded).
// Raw signals (what.was.observed) live in the outbox/events tables.

export interface RecoveryCaseEvent {
  id: string
  caseId: string
  eventType: 'transition' | 'backfill' | 'override'
  fromRecoveryState: RecoveryStateV2 | null
  toRecoveryState: RecoveryStateV2 | null
  fromEngagementState: EngagementStateV2 | null
  toEngagementState: EngagementStateV2 | null
  reason: string
  trigger: Record<string, unknown>
  occurredAt: string
}

// ============================================================
// EVENT CONSUMPTION — Idempotency tracking
// ============================================================

export interface RecoveryCaseEventConsumption {
  sourceEventId: string
  caseId: string
  processedAt: string
}

// ============================================================
// FINANCIAL STATE — Money truth produced by the state machine
// ============================================================

export interface RecoveryFinancialState {
  totalOutstanding: number
  totalOverdue: number
  openInvoiceCount: number
  overdueInvoiceCount: number
  disputedInvoiceCount: number
  promisedInvoiceCount: number
  invoiceCount: number
}

// ============================================================
// TRANSITION — What the state machine produces
// ============================================================

export interface RecoveryCaseTransition {
  caseId: string
  recoveryState?: RecoveryStateV2
  engagementState?: EngagementStateV2
  nextActionType?: NextActionType | null
  nextActionDueAt?: string | null
  promiseToPayDate?: string | null
  attentionScore?: number
  version: number
  financialState: RecoveryFinancialState
  event: Omit<RecoveryCaseEvent, 'id' | 'occurredAt'>
}

// ============================================================
// DERIVE STATE — Deterministic precedence from invoice data
// ============================================================

export function deriveRecoveryState(invoices: {
  status: string
  dueDate?: string | null
}[]): RecoveryStateV2 {
  let hasOverdue = false
  let hasPartial = false
  let hasActive = false

  for (const inv of invoices) {
    const s = inv.status.toLowerCase()
    if (s === 'overdue' || (s === 'unpaid' && inv.dueDate && new Date(inv.dueDate) < new Date())) {
      hasOverdue = true
    } else if (s === 'partial') {
      hasPartial = true
    } else if (s === 'unpaid' || s === 'active') {
      hasActive = true
    } else if (s === 'paid' || s === 'reconciled') {
      // paid — doesn't affect state
    } else if (s === 'disputed') {
      return 'disputed'
    }
  }

  if (hasOverdue) return 'overdue'
  if (hasPartial) return 'partial_payment'
  if (hasActive) return 'active'
  return 'recovered'
}

// ============================================================
// COMPUTE ATTENTION SCORE — Deterministic ranking
// ============================================================

export function computeAttentionScore(params: {
  overdueDays: number
  totalOverdue: number
  linkClicked: boolean
  promiseBroken: boolean
  paymentDetected: boolean
}): number {
  let score = 0
  if (params.overdueDays > 30) score += 50
  else if (params.overdueDays > 14) score += 30
  else if (params.overdueDays > 7) score += 15

  if (params.linkClicked) score += 20
  if (params.promiseBroken) score += 15
  if (params.totalOverdue > 50000) score += 10
  if (params.totalOverdue > 10000) score += 5
  if (params.paymentDetected) score -= 30

  return Math.max(0, score)
}
