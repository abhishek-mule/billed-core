// ============================================================
// RECOVERY ESCALATION PACK — shared domain math (pure, framework-free).
//
// Phase C: deterministic decision + evidence-pack + settlement workflow.
// Deliberately NO I/O here — every DB concern lives in the runtime adapters
// (frontend `recovery-escalation.ts`, worker lifecycle). This module is the
// single source of truth for:
//   * the recommendation rule + internal ordering grade (never rendered)
//   * basis bullet building (facts only, no score leak)
//   * Recovery Effort Summary aggregation
//   * settlement-offer validation + status lifecycle transitions
//   * the no-causal-evidence invariant (fidelity markers)
// ============================================================

export type EscalationStage = 'healthy' | 'monitor' | 'attention' | 'urgent' | 'critical'

// Mirrors the collection-risk stage scale (recovery-risk.ts). Urgent+ starts
// the day after the Attention band ends (16+ days overdue).
export const ESCALATION_STAGE_DAYS = {
  monitor: 7, // 1–7
  attention: 15, // 8–15
  urgent: 30, // 16–30
  // 31+ → critical
} as const

export function escalationStageFromDays(overdueDays: number): EscalationStage {
  if (overdueDays <= 0) return 'healthy'
  if (overdueDays <= ESCALATION_STAGE_DAYS.monitor) return 'monitor'
  if (overdueDays <= ESCALATION_STAGE_DAYS.attention) return 'attention'
  if (overdueDays <= ESCALATION_STAGE_DAYS.urgent) return 'urgent'
  return 'critical'
}

/** Urgent+ = the stage at which escalation is even eligible. */
export function isUrgentPlus(stage: EscalationStage): boolean {
  return stage === 'urgent' || stage === 'critical'
}

/** Deterministic INR formatting (Indian grouping) shared by basis bullets. */
export function recoveryFormatRupees(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount)
}

// ---------------------------------------------------------------------------
// Domain A — Recovery Decision (basis bullets + recommendation + ordering)
// ---------------------------------------------------------------------------

export interface EscalationDecisionInput {
  /** Oldest overdue days across the customer's invoices (case-level). */
  overdueDays: number
  /** Total outstanding across the customer's relevant overdue invoices. */
  outstanding: number
  /** Number of open (unpaid) invoices feeding outstanding. */
  invoiceCount: number
  /** Promised → overdue transitions. */
  brokenPromises: number
  /** Outbound whatsapp sent/delivered/read that did not resolve the invoice. */
  ignoredReminders: number
  /** Call outcomes with no answer. */
  unansweredCalls: number
  /** False when there is no live payment arrangement (offer / promise-to-pay). */
  hasActiveArrangement: boolean
}

export type EscalationBasisKind =
  | 'outstanding'
  | 'overdue'
  | 'broken_promise'
  | 'ignored_reminder'
  | 'unanswered_call'
  | 'no_arrangement'

export interface EscalationBasisItem {
  /** Machine kind — lets the UI group/colour bullets. */
  kind: EscalationBasisKind
  /** Human fact string, always backed by a verifiable ledger fact. */
  fact: string
}

export interface RecoveryEscalationDecision {
  recommended: boolean
  /** INTERNAL ONLY — deterministic integer for ordering which case surfaces
   *  first. Never rendered to merchants; basis bullets are what merchants see. */
  grade: number
  basis: EscalationBasisItem[]
}

/**
 * Deterministic BillZo policy (Section 5/6):
 *
 *   Escalation is RECOMMENDED only when the case is at stage Urgent+ AND ≥1
 *   negative relationship fact is present (broken promise OR ≥2 ignored
 *   reminders OR unanswered call attempts).
 *
 * The output is NOT a number that merchants see: `basis` bullets always
 * reference verifiable ledger facts; `grade` exists only for ordering.
 */
export function escalationDecision(input: EscalationDecisionInput): RecoveryEscalationDecision {
  const basis: EscalationBasisItem[] = []

  if (input.outstanding > 0) {
    basis.push({
      kind: 'outstanding',
      fact: `${recoveryFormatRupees(input.outstanding)} outstanding across ${input.invoiceCount} invoice${input.invoiceCount === 1 ? '' : 's'}`,
    })
  }
  if (input.overdueDays > 0) {
    basis.push({ kind: 'overdue', fact: `${input.overdueDays} days overdue` })
  }
  if (input.brokenPromises > 0) {
    basis.push({
      kind: 'broken_promise',
      fact: `${input.brokenPromises} payment promise${input.brokenPromises === 1 ? '' : 's'} broken`,
    })
  }
  if (input.ignoredReminders > 0) {
    basis.push({
      kind: 'ignored_reminder',
      fact: `${input.ignoredReminders} reminder${input.ignoredReminders === 1 ? '' : 's'} delivered/read without resolution`,
    })
  }
  if (input.unansweredCalls > 0) {
    basis.push({
      kind: 'unanswered_call',
      fact: `${input.unansweredCalls} call${input.unansweredCalls === 1 ? '' : 's'} unanswered`,
    })
  }
  if (!input.hasActiveArrangement && input.outstanding > 0) {
    basis.push({ kind: 'no_arrangement', fact: 'No active payment arrangement' })
  }

  const stage = escalationStageFromDays(input.overdueDays)
  const negativeFact =
    input.brokenPromises >= 1 || input.ignoredReminders >= 2 || input.unansweredCalls >= 1

  return {
    recommended: isUrgentPlus(stage) && negativeFact,
    grade: internalOrderingGrade(input),
    basis,
  }
}

/** Deterministic ordering integer — NEVER rendered. See Section 5. */
function internalOrderingGrade(input: EscalationDecisionInput): number {
  return (
    Math.max(input.overdueDays, 0) +
    Math.floor(Math.max(input.outstanding, 0) / 1000) +
    input.brokenPromises * 10 +
    (input.ignoredReminders >= 2 ? 5 : 0) +
    input.unansweredCalls * 3
  )
}

// ---------------------------------------------------------------------------
// Recovery Effort Summary (Section 7) — the centerpiece of the pack
// ---------------------------------------------------------------------------

export type RecoveryEffortChannel =
  | 'whatsapp'
  | 'followups'
  | 'calls'
  | 'promises'
  | 'payments'

export interface RecoveryEffortEvent {
  channel: RecoveryEffortChannel
  occurredAt: string
}

export interface RecoveryEffortSummary {
  attempts: number
  /** Whole days spanned by the effort window (min 1). */
  days: number
  channels: Record<RecoveryEffortChannel, number>
  noise: string
  result: string
}

/**
 * Aggregate the recovery spine into "9 attempts over 47 days". `result` is
 * deterministic: payments win, then promises, else the neutral default.
 */
export function buildEffortSummary(
  events: RecoveryEffortEvent[],
  window: { start: string; end: string },
): RecoveryEffortSummary {
  const channels: Record<RecoveryEffortChannel, number> = {
    whatsapp: 0,
    followups: 0,
    calls: 0,
    promises: 0,
    payments: 0,
  }
  for (const e of events) {
    if (channels[e.channel] !== undefined) channels[e.channel] += 1
  }

  const attempts = events.length
  const spanMs = Date.parse(window.end) - Date.parse(window.start)
  const days = Number.isFinite(spanMs) && spanMs > 0 ? Math.ceil(spanMs / 86_400_000) : 1

  const result =
    channels.payments > 0
      ? 'Payment received'
      : channels.promises > 0
        ? 'Promises recorded — none resulting in payment'
        : 'No successful payment or reliable commitment.'

  return {
    attempts,
    days,
    channels,
    noise: `${attempts} attempts over ${days} days`,
    result,
  }
}

// ---------------------------------------------------------------------------
// Domain C — Settlement Workflow (offer validation + status lifecycle)
// ---------------------------------------------------------------------------

export type SettlementOfferKind = 'full' | 'partial' | 'plan' | 'revised_promise_date'

export interface SettlementOffer {
  type: SettlementOfferKind
  /** Amount when applicable (full/partial/plan). */
  amount?: number
  /** Instalment description when type = plan (e.g. "3 monthly instalments"). */
  schedule?: string
  /** ISO date when type = revised_promise_date. */
  dueBy?: string
  note?: string
}

export const SETTLEMENT_OFFER_KINDS: SettlementOfferKind[] = [
  'full',
  'partial',
  'plan',
  'revised_promise_date',
]

export interface SettlementOfferValidation {
  valid: boolean
  errors: string[]
}

/** Validate a settlement offer. Unknown kinds / negative amounts are always invalid. */
export function validateSettlementOffer(offer: unknown): SettlementOfferValidation {
  const errors: string[] = []
  const o = offer as SettlementOffer | null | undefined

  if (!o || typeof o !== 'object' || typeof o.type !== 'string') {
    return { valid: false, errors: ['settlement_offer.type is required'] }
  }
  if (!SETTLEMENT_OFFER_KINDS.includes(o.type)) {
    return { valid: false, errors: [`settlement_offer.type must be one of: ${SETTLEMENT_OFFER_KINDS.join(', ')}`] }
  }

  const hasAmount = typeof o.amount === 'number' && Number.isFinite(o.amount)
  if (hasAmount && o.amount! < 0) {
    errors.push('settlement_offer.amount cannot be negative')
  }

  switch (o.type) {
    case 'full':
      if (hasAmount && o.amount! <= 0) errors.push('full-payment amount must be positive when provided')
      break
    case 'partial':
      if (!hasAmount || o.amount! <= 0) errors.push('partial-payment offer requires a positive amount')
      break
    case 'plan':
      if (!hasAmount || o.amount! <= 0) errors.push('payment plan requires a positive total amount')
      if (!o.schedule || String(o.schedule).trim().length === 0) {
        errors.push('payment plan requires a schedule (e.g. "3 monthly instalments")')
      }
      break
    case 'revised_promise_date':
      if (!o.dueBy || Number.isNaN(Date.parse(o.dueBy))) {
        errors.push('revised_promise_date offer requires a dueBy ISO date')
      }
      break
  }

  return { valid: errors.length === 0, errors }
}

// ---------------------------------------------------------------------------
// Escalation lifecycle (independent of the case state machine — Section 14)
// ---------------------------------------------------------------------------

export type EscalationStatus =
  | 'assessed'
  | 'recommended'
  | 'prepared'
  | 'notified'
  | 'settled'
  | 'cancelled'

export type MerchantDecision = 'authorize' | 'offer_plan' | 'pause' | 'decline'

export const MERCHANT_DECISIONS: MerchantDecision[] = [
  'authorize',
  'offer_plan',
  'pause',
  'decline',
]

export const ESCALATION_STATUSES: EscalationStatus[] = [
  'assessed',
  'recommended',
  'prepared',
  'notified',
  'settled',
  'cancelled',
]

const ESCALATION_TRANSITIONS: Record<EscalationStatus, EscalationStatus[]> = {
  assessed: ['recommended', 'prepared', 'settled', 'cancelled'],
  recommended: ['prepared', 'settled', 'cancelled'],
  prepared: ['notified', 'settled', 'cancelled'],
  notified: ['settled', 'cancelled'],
  settled: [],
  cancelled: [],
}

/**
 * Cycle per spec §10: assessed → recommended → prepared → notified →
 * settled | cancelled. `decide()` records merchant_decision without
 * necessarily advancing status (a merchant can pause while prepared).
 * settled/cancelled are terminal.
 */
export function allowsEscalationTransition(
  from: EscalationStatus,
  to: EscalationStatus,
): boolean {
  return ESCALATION_TRANSITIONS[from]?.includes(to) ?? false
}

// ---------------------------------------------------------------------------
// No-causal-evidence invariant (Section 3) — fidelity markers
// ---------------------------------------------------------------------------

/** Echoes Phase 1.5 093 backfill outcome: 67 historical events have no
 *  `billzo_message_id` stored → their link is Unknown. */
export type AttributionFidelity = 'verified' | 'unknown_no_action_id' | 'provider'

export interface CommunicationEvidenceSource {
  /** Customer attribution from the identity chain; null when unproven. */
  attributedCustomerId: string | null
  /** True when the event carries a verified link (billzo_message_id /
   *  recovery_attempt_id → collection_action). */
  hasActionId: boolean
  /** Provider-confirmed event (reached the customer's device). */
  source: 'whatsapp' | 'provider'
}

/**
 * Classify a communication's attribution confidence. The pack can NEVER assert
 * customer attribution for an unverified event:
 *   a) no stored action id  → 'unknown_no_action_id' (093 reality)
 *   b) action id + identity → 'verified'
 *   c) action id, no identity → 'provider'
 */
export function classifyCommunicationFidelity(
  src: CommunicationEvidenceSource,
): AttributionFidelity {
  if (!src.hasActionId) return 'unknown_no_action_id'
  if (src.attributedCustomerId) return 'verified'
  return 'provider'
}

export interface PackEvidenceRow {
  fidelity: AttributionFidelity
  kind: string
  summary: string
  occurredAt: string | null
  /** Source identifier — collection_action.id / recovery_case_events.id / provider id. */
  sourceId: string | null
  /** Customer contact is ONLY attached when fidelity = verified. */
  customerPhone: string | null
  customerName: string | null
}

export interface EvidenceCandidate extends CommunicationEvidenceSource {
  kind: string
  summary: string
  occurredAt: string | null
  sourceId: string | null
}

/**
 * Build the pack's communication evidence. The no-causal-evidence invariant is
 * mechanical here: customer contact is attached ONLY to 'verified' rows. An
 * unverified event still renders (the pack records it as attribution-unknown)
 * but never claims the customer sent/received it.
 */
export function buildPackEvidence(
  rows: EvidenceCandidate[],
  customer?: { name?: string | null; phone?: string | null },
): PackEvidenceRow[] {
  return rows.map(row => {
    const fidelity = classifyCommunicationFidelity(row)
    const verified = fidelity === 'verified'
    return {
      fidelity,
      kind: row.kind,
      summary: row.summary,
      occurredAt: row.occurredAt,
      sourceId: row.sourceId,
      customerPhone: verified ? customer?.phone ?? null : null,
      customerName: verified ? customer?.name ?? null : null,
    }
  })
}