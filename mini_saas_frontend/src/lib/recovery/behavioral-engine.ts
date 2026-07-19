/**
 * Behavioral Engine — INTERFACE CONTRACT (frozen specification).
 *
 * Per product decision: the Behavioral Engine is NOT implemented as a learning
 * system yet. We define the data contract now and freeze it. It becomes a
 * feature extractor over the existing event store + Merchant Memory:
 *
 *   Event Store → Behavioral Signals → Recommendation Engine → Decision
 *
 * It must NOT make decisions, invent confidence, or do prediction/clustering/
 * ML/embeddings. Those are deferred until 10–20 production merchants generate
 * enough real events to make the numbers statistically meaningful.
 *
 * What this module provides TODAY:
 *   - The BehaviorProfile type (the contract).
 *   - A pure extractor `extractBehaviorProfile(signals)` that turns factual
 *     signals into the profile. Deterministic, explainable, no magic numbers.
 *
 * The live data-gathering (getBehaviorProfile) is intentionally left as a thin
 * stub: it documents the inputs and returns what the event store can already
 * provide, but does not yet compute cross-merchant patterns. Filling it in is
 * a later milestone once production data exists.
 */

export interface BehaviorProfile {
  customerId: string
  /** Average days between due date and payment (null = not enough data). */
  averagePaymentDelay: number | null
  /** Number of reminders typically sent before this customer pays. */
  remindersBeforePayment: number | null
  /** Fraction of promises kept, 0–1 (null = no promises yet). */
  promiseKeepRate: number | null
  /** Channel that has historically produced payment: 'call' | 'reminder' | 'mixed' | 'unknown'. */
  preferredChannel: 'call' | 'reminder' | 'mixed' | 'unknown'
  /** Observed best contact time-of-day bucket. */
  preferredTime: 'morning' | 'afternoon' | 'evening' | 'unknown'
  /** True if payments follow phone calls more than reminders. */
  prefersCalls: boolean
  /** True if payments follow reminders. */
  prefersReminder: boolean
  /** Median hours between a message send and the customer's read. */
  responseLatencyHours: number | null
  /** Free-text observed pattern, e.g. "Pays after 2 reminders". */
  paymentPattern: string
  /** Number of observed cycles; gates whether the profile is trustworthy. */
  observations: number
}

/** Raw factual signals the extractor consumes (all from existing sources). */
export interface BehaviorSignals {
  payments: Array<{ dueDate: string | null; paidDate: string | null; channel: string | null }>
  remindersBeforeEachPayment: number[]
  promises: Array<{ status: string; promiseDate: string | null; paidAt: string | null }>
  actionOutcomes: Array<{ channel: string; ledToPayment: boolean }>
  messageReadLatenciesHours: number[]
  preferredTimeBucket?: 'morning' | 'afternoon' | 'evening'
  merchantMemoryHints?: string[]
}

const DAY = 86400000

/**
 * Pure, deterministic extraction. This is the ONLY logic here — no prediction.
 * Every output is grounded in the provided signals.
 */
export function extractBehaviorProfile(
  customerId: string,
  s: BehaviorSignals
): BehaviorProfile {
  const delays = s.payments
    .filter((p) => p.dueDate && p.paidDate)
    .map((p) => (new Date(p.paidDate!).getTime() - new Date(p.dueDate!).getTime()) / DAY)
  const averagePaymentDelay =
    delays.length > 0 ? Math.round((delays.reduce((a, b) => a + b, 0) / delays.length) * 10) / 10 : null

  const remindersBeforePayment =
    s.remindersBeforeEachPayment.length > 0
      ? Math.round(
          (s.remindersBeforeEachPayment.reduce((a, b) => a + b, 0) /
            s.remindersBeforeEachPayment.length) *
            10
        ) / 10
      : null

  const totalPromises = s.promises.length
  const kept = s.promises.filter((p) => p.status === 'kept' || p.status === 'fulfilled').length
  const promiseKeepRate = totalPromises > 0 ? Math.round((kept / totalPromises) * 100) / 100 : null

  const callPayments = s.actionOutcomes.filter((a) => a.channel === 'call' && a.ledToPayment).length
  const reminderPayments = s.actionOutcomes.filter(
    (a) => (a.channel === 'reminder' || a.channel === 'payment_request') && a.ledToPayment
  ).length
  let preferredChannel: BehaviorProfile['preferredChannel'] = 'unknown'
  if (callPayments > 0 || reminderPayments > 0) {
    preferredChannel =
      callPayments > reminderPayments ? 'call' : reminderPayments > callPayments ? 'reminder' : 'mixed'
  }
  const prefersCalls = callPayments >= reminderPayments && callPayments > 0
  const prefersReminder = reminderPayments >= callPayments && reminderPayments > 0

  const responseLatencyHours =
    s.messageReadLatenciesHours.length > 0
      ? Math.round(
          (s.messageReadLatenciesHours.reduce((a, b) => a + b, 0) /
            s.messageReadLatenciesHours.length) *
            10
        ) / 10
      : null

  // Build a factual paymentPattern string (no invented percentages).
  const parts: string[] = []
  if (remindersBeforePayment != null) parts.push(`Usually pays after ${remindersBeforePayment} reminder${remindersBeforePayment === 1 ? '' : 's'}`)
  if (promiseKeepRate != null) parts.push(`Keeps ${Math.round(promiseKeepRate * 100)}% of promises`)
  if (averagePaymentDelay != null) parts.push(`Average payment delay ${averagePaymentDelay}d`)
  if (preferredChannel === 'call') parts.push('Pays after calls')
  else if (preferredChannel === 'reminder') parts.push('Pays after reminders')
  if (s.merchantMemoryHints?.length) parts.push(...s.merchantMemoryHints)

  const observations = s.payments.length + s.promises.length + s.actionOutcomes.length

  return {
    customerId,
    averagePaymentDelay,
    remindersBeforePayment,
    promiseKeepRate,
    preferredChannel,
    preferredTime: s.preferredTimeBucket ?? 'unknown',
    prefersCalls,
    prefersReminder,
    responseLatencyHours,
    paymentPattern: parts.length ? parts.join('. ') + '.' : 'Not enough history yet.',
    observations,
  }
}

/**
 * FROZEN STUB — do not expand into a learning system yet.
 *
 * Documents the production inputs the real implementation will gather once
 * 10–20 merchants generate enough events. Today it returns a profile built
 * only from whatever signals the caller passes (the event store can already
 * supply these). No cross-merchant statistics, no ML, no telemetry writes.
 */
export async function getBehaviorProfile(_customerId: string): Promise<BehaviorProfile | null> {
  // Intentionally not wired to Supabase. When production data exists, this
  // gathers BehaviorSignals from collection_actions / collection_action_events
  // / payment_promises / whatsapp_events / merchant_customer_notes and calls
  // extractBehaviorProfile(). Until then, return null so callers degrade.
  return null
}
