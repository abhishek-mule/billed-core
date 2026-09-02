// Phase 1.5 (C1): Reminder history projection from canonical attempts and
// outcomes.
//
// This replaces the raw whatsapp_events row-counting read-model used to feed
// the decision engine. History is derived from finalized collection_actions
// (attempts that left the scheduled state) plus explicit recovery_outcomes
// (delivery, reply, promise, payment evidence). Field names the decision
// engine consumes are preserved so canSendReminder() keeps its exact rule
// semantics — this is a data-source replacement, not a new decision engine.

export type AttemptRow = {
  id: string
  action_type: string
  status: string
  executed_at: string | null
  created_at: string
  delivered_at: string | null
  read_at: string | null
  last_delivery_status: string | null
}

export type AttemptOutcomeRow = {
  outcome_type: string
  outcome_at: string
}

export type AttemptProjection = {
  id: string
  actionType: string
  status: string
  attemptAt: string | null
  delivered: boolean
  read: boolean
  failedDelivery: boolean
  outcomes: string[]
}

export type ReminderHistory = {
  totalSent: number
  sentThisMonth: number
  consecutiveIgnores: number
  lastReminderAt: string | null
  lastReadAt: null
  linkClicked: false
  hoursSinceLastCustomerReminder: number
  lastCustomerReminderAt: string | null
  attempts: AttemptProjection[]
}

// An attempt was "made" once it left the scheduled state. Cancel/expired/scheduled
// rows were never attempts. This is the canonical "3 recovery attempts were made"
// definition — one attempt per row, never multiplied by provider message events.
export const EXECUTED_ATTEMPT_STATUSES = ['in_progress', 'completed', 'failed']

export function isExecutedAttempt(status: string): boolean {
  return EXECUTED_ATTEMPT_STATUSES.includes(status)
}

/** When was this attempt actually made? Falls back to creation time for rows that
 *  skipped explicit execution timestamps (older/legacy attempts). */
export function attemptMoment(attempt: Pick<AttemptRow, 'executed_at' | 'created_at'>): string {
  return attempt.executed_at || attempt.created_at
}

export function buildAttemptHistory(input: {
  attempts: AttemptRow[]
  outcomesByAttempt: Record<string, AttemptOutcomeRow[]>
  customerLastAttemptAt?: string | null
  now?: string
}): ReminderHistory {
  const nowMs = input.now ? new Date(input.now).getTime() : Date.now()

  const executed = input.attempts
    .filter(a => isExecutedAttempt(a.status))
    .sort((a, b) => new Date(attemptMoment(b)).getTime() - new Date(attemptMoment(a)).getTime())

  // Legacy month window semantics (calendar month start), preserved in shape but
  // anchored to the evaluation reference time (which at runtime equals the real
  // clock, matching the replaced implementation).
  const refNow = input.now ? new Date(input.now) : new Date()
  const monthStart = new Date(refNow)
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)

  const projections: AttemptProjection[] = executed.map(a => {
    const outcomes = input.outcomesByAttempt[a.id] || []
    const outcomeTypes = outcomes.map(o => o.outcome_type)
    return {
      id: a.id,
      actionType: a.action_type,
      status: a.status,
      attemptAt: attemptMoment(a),
      delivered:
        a.delivered_at !== null ||
        a.last_delivery_status === 'delivered' ||
        outcomeTypes.includes('delivered'),
      read: a.read_at !== null || outcomeTypes.includes('customer_read'),
      failedDelivery:
        a.last_delivery_status === 'failed' || outcomeTypes.includes('failed_delivery'),
      outcomes: outcomeTypes,
    }
  })

  // Consecutive ignores: the run of most-recent attempts that were not read.
  // Legacy semantics preserved exactly: read breaks the run; delivered /
  // failed-delivery attempts are neutral (no ignore, no reset); everything
  // else the customer never engaged counts as an ignore.
  let consecutiveIgnores = 0
  for (const p of projections) {
    if (p.read) break
    if (p.delivered || p.failedDelivery) continue
    consecutiveIgnores++
  }

  const totalSent = projections.length
  const sentThisMonth = projections.filter(p => new Date(p.attemptAt || 0) >= monthStart).length
  const lastReminderAt = projections[0]?.attemptAt || null
  const lastCustomerReminderAt = input.customerLastAttemptAt || null
  const hoursSinceLastCustomerReminder = lastCustomerReminderAt
    ? (nowMs - new Date(lastCustomerReminderAt).getTime()) / 3600000
    : 99

  return {
    totalSent,
    sentThisMonth,
    consecutiveIgnores,
    lastReminderAt,
    lastReadAt: null,
    linkClicked: false,
    hoursSinceLastCustomerReminder,
    lastCustomerReminderAt,
    attempts: projections,
  }
}