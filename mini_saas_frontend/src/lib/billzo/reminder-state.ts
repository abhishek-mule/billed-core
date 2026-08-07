/**
 * recovery state as a monotonic state machine.
 *
 * The badge shows ONE state — the single highest recovery milestone the
 * merchant cares about. It is designed so a badge never regresses:
 *   paid > promised > (phone blocked) > read > delivered > sent > not_sent
 *
 * spec:
 *   - Did the customer pay?  -> Paid (wins over everything)
 *   - Did they promise?      -> Promised (even if they read a later
 *                                reminder, they stay Promised — never drop
 *                                back to Read)
 *   - Is the phone missing?  -> Phone Missing (a blocker that should scream)
 *   - Otherwise the most advanced WhatsApp delivery milestone reached:
 *                                Read > Delivered > Sent > Not sent
 *
 * WhatsApp is only ONE signal. This file is the seam where future signals
 * (call outcome, visit scheduled, wrong number, customer blocked) fold in,
 * so the recovery state becomes the canonical truth for every surface.
 */

export type DeliveryStatus =
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'failed'

export type RecoveryStateId =
  | 'phone_missing'
  | 'not_sent'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'promised'
  | 'paid'

export interface RecoveryStateInput {
  /** whether the customer has a usable phone number */
  hasPhone?: boolean
  /** a payment against the outstanding balance has been recorded */
  isPaid?: boolean
  /** an active (unfulfilled) promise to pay exists */
  hasActivePromise?: boolean
  /** most advanced WhatsApp delivery milestone reached by the customer */
  maxDeliveryStatus?: DeliveryStatus | null
}

export type DominantAction =
  | 'whatsapp'
  | 'call'
  | 'record_payment'
  | 'promise'
  | 'open_customer'
  | null

export interface RecoveryState {
  id: RecoveryStateId
  /** short, merchant-friendly label */
  label: string
  /** tailwind classes for the badge chip */
  chip: string
  /** tiny colored dot (used on lists/detail rows) */
  dot: string
  /** ordinal used for layout, not precedence */
  rank: number
}

const RAW: Record<RecoveryStateId, Omit<RecoveryState, 'id'>> = {
  phone_missing: { label: 'Phone Missing', chip: 'bg-danger-soft text-danger', dot: 'bg-danger', rank: 0 },
  not_sent:      { label: 'Not sent',      chip: 'bg-muted text-muted-foreground', dot: 'bg-muted-foreground', rank: 1 },
  sent:          { label: 'Sent',          chip: 'bg-outstanding-soft text-outstanding', dot: 'bg-outstanding', rank: 2 },
  delivered:     { label: 'Delivered',     chip: 'bg-recovery-soft text-recovery', dot: 'bg-recovery', rank: 3 },
  read:          { label: 'Read',          chip: 'bg-info-soft text-info', dot: 'bg-info', rank: 4 },
  promised:      { label: 'Promised',      chip: 'bg-warning-soft text-warning', dot: 'bg-warning', rank: 5 },
  paid:          { label: 'Paid',          chip: 'bg-success-soft text-success', dot: 'bg-success', rank: 6 },
}

const state = (id: RecoveryStateId): RecoveryState => ({ id, ...RAW[id] })

/**
 * Derive the single recovery state. Monotonic: a higher milestone is never
 * displaced by a later lower one (promise won, read another reminder later).
 */
export function deriveRecoveryState(input?: RecoveryStateInput | null): RecoveryState {
  const hasPhone = input?.hasPhone ?? true

  if (input?.isPaid) return state('paid')
  if (input?.hasActivePromise) return state('promised')
  if (!hasPhone) return state('phone_missing')

  const d = input?.maxDeliveryStatus
  if (d === 'read') return state('read')
  if (d === 'delivered') return state('delivered')
  if (d === 'sent') return state('sent')

  return state('not_sent')
}

/* ─── "Why is this customer here?" ──────────────────────────────────── */

export interface RecoveryWhyInput extends RecoveryStateInput {
  /** number of reminders the customer knowingly ignored */
  ignoredReminders?: number
  /** number of promises not kept */
  brokenPromises?: number
  /** full days overdue (>= 0) */
  overdueDays?: number
  /** days until the current promise lands (negative = overdue, 0 = today) */
  promiseDueDays?: number
  /** recoverable amount expected today (used for the amount line) */
  expectedToday?: number
}

/**
 * Short, always-actionable reason lines. Kept opinionated and capped — the
 * merchant reads the greeting batch (why line) in under a second, then the
 * badge, then acts.
 */
export function deriveWhyLines(input?: RecoveryWhyInput | null): string[] {
  if (!input) return []
  const lines: string[] = []

  if (input.brokenPromises && input.brokenPromises > 0) {
    lines.push(`Promise not kept`)
  } else if (input.hasActivePromise && input.promiseDueDays !== undefined) {
    if (input.promiseDueDays < 0) lines.push('Promise overdue')
    else if (input.promiseDueDays === 0) lines.push('Promise due today')
    else if (input.promiseDueDays <= 3) lines.push(`Promise in ${input.promiseDueDays}d`)
  }

  if (input.ignoredReminders && input.ignoredReminders > 0) {
    lines.push(`Ignored ${input.ignoredReminders} reminder${input.ignoredReminders > 1 ? 's' : ''}`)
  }

  if (input.overdueDays && input.overdueDays > 0) {
    lines.push(`${input.overdueDays} days overdue`)
  }

  if (lines.length === 0) {
    lines.push('Awaiting first reminder')
  }

  return lines.slice(0, 2)
}

/* ─── Dominant action ───────────────────────────────────────────────── */

export interface DominantActionInput extends RecoveryWhyInput {}

/**
 * The action sheet is always identical (WhatsApp / Call / Record / Promise /
 * Open Customer). Only ONE of those actions is visually emphasised based on
 * the recovery state — the merchant never has to think about which to tap,
 * yet is never surprised by a button changing meaning.
 */
export function dominantAction(input?: DominantActionInput | null): DominantAction {
  if (!input) return null

  if (input.isPaid) return null
  if ((input.hasPhone ?? true) === false) return 'open_customer'
  if (input.brokenPromises && input.brokenPromises > 0) return 'call'
  if (input.hasActivePromise) {
    const due = input.promiseDueDays ?? 0
    if (due <= 0) return 'call'
    return 'whatsapp'
  }
  return 'whatsapp'
}