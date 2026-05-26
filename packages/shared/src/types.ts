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
export function generateBillzoMessageId(): string {
  const ts = BigInt(Date.now()) << 12n
  const nano = process.hrtime.bigint() & 0xfffn
  const combined = ts | nano
  return `bmsg_${combined.toString(36)}`
}

/**
 * Generate a monotonic event sequence value using the same Snowflake scheme.
 * Sortable by wall-clock order, unique per-call without atomics.
 */
export function generateEventSequence(): bigint {
  const ts = BigInt(Date.now()) << 12n
  const nano = process.hrtime.bigint() & 0xfffn
  return ts | nano
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
