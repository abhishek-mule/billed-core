// ============================================================
// REMINDER STAGE — Operational cadence
// ============================================================

export const REMINDER_STAGES = ['t0_soft', 't24_nudge', 't72_strong', 't5_warning'] as const
export type ReminderStage = (typeof REMINDER_STAGES)[number]

export const STAGE_LABELS: Record<ReminderStage, string> = {
  t0_soft: 'friendly reminder',
  t24_nudge: 'payment follow-up',
  t72_strong: 'urgent reminder',
  t5_warning: 'final notice',
}

// Legacy stage name mapping for backward compatibility with existing DB records.
// Old DB values → canonical ReminderStage
const LEGACY_STAGE_MAP: Record<string, ReminderStage> = {
  t1_soft: 't0_soft',
  t2_firm: 't24_nudge',
  t3_urgent: 't72_strong',
  t4_final: 't5_warning',
}

export function normalizeStage(stage: string | null | undefined): ReminderStage {
  const s = stage || ''
  if (REMINDER_STAGES.includes(s as ReminderStage)) return s as ReminderStage
  if (LEGACY_STAGE_MAP[s]) return LEGACY_STAGE_MAP[s]
  return 't0_soft'
}

export function getNextStage(current: ReminderStage): ReminderStage {
  const idx = REMINDER_STAGES.indexOf(current)
  if (idx < 0 || idx >= REMINDER_STAGES.length - 1) return current
  return REMINDER_STAGES[idx + 1]
}

// ============================================================
// WHATSAPP STATUS — Transport telemetry
// ============================================================

export type WhatsAppStatus =
  | 'queued'
  | 'sent'
  | 'server_ack'
  | 'delivered'
  | 'read'
  | 'clicked_upi'
  | 'payment_confirmed'
  | 'failed'
  | 'rate_limited'
  | 'received'

// ============================================================
// WHATSAPP PROVIDER
// ============================================================

// ============================================================
// PROJECTION TRANSPORT STATE — Linear delivery progression
// These form a strict precedence ladder for conflict resolution.
// failed_terminal is a sink state — once entered, immutable.
// received has same precedence as delivered.
// ============================================================

export type ProjectionTransportState =
  | 'queued'
  | 'sent'
  | 'server_ack'
  | 'delivered'
  | 'received'
  | 'read'
  | 'failed_terminal'

// ============================================================
// PROJECTION DELIVERY HEALTH — Orthogonal delivery condition
// Does NOT participate in conflict resolution.
// healthy: normal operation
// retrying: transient failure, retry in progress
// degraded: repeated failures, service degraded
// ============================================================

export type ProjectionDeliveryHealth =
  | 'healthy'
  | 'retrying'
  | 'degraded'

export type WhatsAppProvider = 'gupshup' | 'baileys'
export type AutomationMode = 'full_auto' | 'manual' | 'muted'

// ============================================================
// MESSAGE ORIGIN — Who triggered the send
// ============================================================

export const MESSAGE_ORIGINS = ['automation', 'manual', 'webhook', 'system'] as const
export type MessageOrigin = (typeof MESSAGE_ORIGINS)[number]

// ============================================================
// CANONICAL MESSAGE IDENTITY
// ============================================================

export interface MessageIdentity {
  billzoMessageId: string
  conversationId: string
  messageOrigin: MessageOrigin
  parentBillzoMessageId: string | null
  transportMessageHash: string
  eventSequence: bigint
  attemptNumber: number
  reminderStage: string | null
}

// ============================================================
// IDENTITY GENERATION — Snowflake-style monotonic IDs
// ============================================================

import crypto from 'crypto'

/**
 * Generate a canonical billzo_message_id using Snowflake-style encoding.
 * Combines Date.now() (shifted left 12 bits) with hrtime low 12 bits
 * for intra-millisecond uniqueness without shared mutable state.
 *
 * Format: bmsg_{base36(snowflake)}
 */
let _seqCounter = 0n

export function generateBillzoMessageId(): string {
  const ts = BigInt(Date.now()) << 12n
  const counter = (_seqCounter++ & 0xfffn)
  return `bmsg_${(ts | counter).toString(36)}`
}

export function generateEventSequence(): bigint {
  const ts = BigInt(Date.now()) << 12n
  const counter = (_seqCounter++ & 0xfffn)
  return ts | counter
}

/**
 * Compute a transport-level message hash for dedup and reconciliation.
 * Uses MD5 (fast, not cryptographic) over canonical fields.
 *
 * Retry safety: includes reminderStage + attemptNumber so retries
 * within the same minute-bucket produce distinct hashes.
 */
export function computeTransportHash(params: {
  phone: string
  message: string
  invoiceId?: string | null
  amount?: number
  reminderStage?: string | null
  attemptNumber?: number
}): string {
  const raw = [
    params.phone,
    params.message,
    params.invoiceId || '',
    params.amount?.toString() || '',
    params.reminderStage || '',
    (params.attemptNumber || 1).toString(),
  ].join('|')
  return crypto.createHash('md5').update(raw).digest('hex')
}

// ============================================================
// INVOICE STATUS
// ============================================================

export type InvoiceStatus = 'paid' | 'partial' | 'unpaid' | 'overdue'

// ============================================================
// INVOICE RECOVERY STATE — Reminder lifecycle FSM
// ============================================================
// This state machine governs the automated reminder lifecycle at the
// invoice level. It replaces the overloaded meaning of next_recovery_at = NULL.
//
// States:
//   pending        — New invoice, never processed by reminder worker
//   scheduled      — Active automation, worker processes based on next_recovery_at
//   paused         — Merchant snoozed/halted automated reminders
//   manual_review  — All automatic stages exhausted, needs merchant action
//   completed      — Settled (paid/waived)
//   disputed       — Contested, halt all automation
//
// Worker processes only: pending, scheduled
// Worker ignores:        paused, manual_review, completed, disputed

export const INVOICE_RECOVERY_STATES = [
  'pending',
  'scheduled',
  'paused',
  'manual_review',
  'completed',
  'disputed',
] as const

export type InvoiceRecoveryState = (typeof INVOICE_RECOVERY_STATES)[number]

export function isOverdue(
  status: InvoiceStatus,
  dueDate: string | Date | null | undefined,
  now: Date = new Date()
): boolean {
  if (status === 'paid') return false
  if (!dueDate) return false
  const due = typeof dueDate === 'string' ? new Date(dueDate) : dueDate
  return due < now
}

// ============================================================
// SYNC STATUS
// ============================================================

export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'failed' | 'conflict' | 'dead_letter'

// ============================================================
// RECOVERY STATE — Business semantic state
// Derived from events + telemetry; drives collection decisions.
// ============================================================

export const RECOVERY_STATES = [
  'created',
  'due_soon',
  'overdue_soft',
  'overdue_engaged',
  'overdue_ignored',
  'high_risk',
  'escalated',
  'recovered',
  'failed',
] as const

export type RecoveryState = (typeof RECOVERY_STATES)[number]

// ============================================================
// RECOVERY ENGAGEMENT STATE — Customer behavioral interpretation
// ============================================================

export const RECOVERY_ENGAGEMENT_STATES = [
  'unseen',
  'attention',
  'engaged',
  'intent',
  'likely_to_pay',
  'ghosting',
  'failed',
] as const

export type RecoveryEngagementState = (typeof RECOVERY_ENGAGEMENT_STATES)[number]

// ============================================================
// MERCHANT OPERATING HOURS
// ============================================================

export interface OperatingHoursConfig {
  enabled: boolean
  windows: Array<{ start: string; end: string }>
  quietDays: number[]
  quietAfter: string
}

export const DEFAULT_OPERATING_HOURS: OperatingHoursConfig = {
  enabled: true,
  windows: [
    { start: '09:30', end: '11:30' },
    { start: '18:00', end: '20:30' },
  ],
  quietDays: [0],
  quietAfter: '21:00',
}

// ============================================================
// BEHAVIORAL MEMORY — Observation layer
// ============================================================
// Observations are interpreted hypotheses, not facts.
// They carry confidence and interpreter version for replay determinism.
// Raw transport events remain the only canonical truth.

export type ObservationSource = 'transport' | 'payment' | 'merchant_action' | 'system_inference'

export type ObservationType =
  | 'message_seen'
  | 'attention_absent'
  | 'response_absent'
  | 'resolution_absent'
  | 'payment_intent'
  | 'resolution_completed'
  | 'channel_failure'

export interface BehavioralObservation {
  type: ObservationType
  confidence: number
  source: ObservationSource
  sourceReliability: number
  interpreterVersion: string
  occurredAt: string
  tenantId: string
  customerId: string
  invoiceId?: string
  absenceWindowHours?: number
  metadata?: Record<string, unknown>
}

export interface ProjectionDelta {
  tenantId: string
  customerId: string
  invoiceId: string
  billzoMessageId: string
  transportState: string
  deliveryHealth: string
  prevTransportState: string | null
  prevDeliveryHealth: string | null
  occurredAt: string
  prevOccurredAt: string | null
}

export interface ProfileChanged {
  tenantId: string
  customerId: string
  changedFields: string[]
  confidenceBefore: number
  confidenceAfter: number
  traitChanges?: Record<string, number>
  occurredAt: string
}

// ============================================================
// BEHAVIORAL MEMORY — Materialized aggregates
// ============================================================

export interface CustomerBehavioralMetrics {
  tenantId: string
  customerId: string
  schemaVersion: number
  readRate: number
  paymentConversionRate: number
  avgReadToPayHours: number
  avgReminderResponseHours: number
  avgSettlementLatencyHours: number
  observationCount: number
  totalInterventionsSent: number
  totalInterventionsRead: number
  totalResolutionsAfterIntervention: number
  totalEscalationsReceived: number
  lastEscalationAt: string | null
  interventionsUntilResolution: number | null
  lastResolutionAt: string | null
  lastReadAt: string | null
  lastResponseAt: string | null
  lastEventAt: string | null
  updatedAt: string
}

export interface CustomerLiquidityWindow {
  tenantId: string
  customerId: string
  schemaVersion: number
  windowType: string
  weekday: number
  hourBucket: number
  affinityScore: number
  observationCount: number
  lastSeenAt: string | null
}

export interface TraitValue {
  value: number
  priorSource: ResolvedPrior['source']
  evidenceWeight: number
}

export interface BehavioralTraits {
  temporalRegularity: TraitValue
  constraintAffinity: TraitValue
  strategicDelayLikelihood: TraitValue
  disputeRisk: TraitValue
  channelViability: TraitValue
}

// ============================================================
// TEMPORAL PRIOR — Distributional prior for Bayesian blending
// ============================================================
// Used to regress sparse customer observations toward cohort/tenant
// baselines instead of zero or uniform.
//
// design notes:
//   - effectiveWeight is NOT equivalent to observationCount.
//     It represents trust-adjusted contribution mass after decay
//     and confidence weighting. Raw observation count is
//     semantically different and should not be substituted.
//   - All distributions are normalized (sum to 1).
//   - Currently assumes approximate independence between dimensions.
//     Future versions may move toward conditional/joint distributions.
// ============================================================

export interface TemporalPrior {
  weekdayDistribution: number[]
  hourDistribution: number[]
  interventionLatencyDistribution: number[]
  observationCount: number
  effectiveWeight: number
}

export type PriorSource = 'customer' | 'segment' | 'tenant' | 'global' | 'none'

export interface ResolvedPrior {
  source: PriorSource
  prior: TemporalPrior | null
}

// ============================================================
// BEHAVIORAL RECOMMENDATION CONTEXT — Orchestrator boundary
// ============================================================
// The orchestrator must consume this, never raw
// customer_behavioral_metrics directly.
//
// This is the inference→policy boundary:
//   memory → inference → recommendation → policy
//   NEVER:  memory → orchestration spaghetti
// ============================================================

export interface BehavioralRecommendationContext {
  tenantId: string
  customerId: string
  traits: BehavioralTraits
  readRate: number
  channelViability: number
  entropy: number
  priorSource: PriorSource
  observationCount: number
  updatedAt: string
}

// ============================================================
// DECAY CONFIGURATION
// ============================================================

export const DECAY_HALF_LIVES = {
  readRate: 30,
  paymentConversion: 45,
  readToPayLatency: 45,
  reminderResponseLatency: 30,
  settlementLatency: 60,
  liquidityWindowAffinity: 60,
  channelViability: 21,
  escalationSensitivity: 120,
} as const

export const INTERPRETER_VERSION = '1.0.0'

// ============================================================
// TENANT WHATSAPP CONFIG
// ============================================================

export interface TenantWhatsAppConfig {
  gupshupApiKey?: string
  gupshupAppName?: string
  sourceNumber?: string
  whatsappProvider?: WhatsAppProvider
  autoSend: boolean
  paymentLinkEnabled: boolean
  paymentLinkExpiry: number
  optInMessage?: string
  templateNames: {
    invoice?: string
    reminderGentle?: string
    reminderFirm?: string
    receipt?: string
    udharGentle?: string
    udharFirm?: string
  }
  operatingHours?: OperatingHoursConfig
}
