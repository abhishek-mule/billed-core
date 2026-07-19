/**
 * Relationship Score — operational relationship indicator.
 *
 * Answers "how should I treat this customer over time?" — NOT "what to do now"
 * (that's the recommendation engine) and NOT a credit score / payment
 * probability. Purely additive points from signals already in the event store.
 *
 * Deliberately decoupled from the recommendation engine: the score informs the
 * merchant, it does not change the recommended action. Later, both feed an
 * adaptive layer, but they stay separate for now.
 */

export interface RelationshipInput {
  /** count of invoices paid before due date */
  paidBeforeDue?: number
  /** count of invoices paid within 7 days of due date */
  paidWithin7?: number
  /** count of promises kept */
  promisesKept?: number
  /** count of promises broken */
  promisesBroken?: number
  /** count of reminders the customer has read */
  remindersRead?: number
  /** count of reminders sent (for responsiveness ratio) */
  remindersSent?: number
  /** count of invoices 30+ days overdue at any point */
  overdue30plus?: number
  /** count of actions that required a phone call to resolve */
  requiredCalls?: number
  /** count of reminders that failed delivery */
  failedReminders?: number
  /** total invoices / payments observed (scale) */
  observations?: number
}

export interface RelationshipScore {
  score: number // 0-100
  stars: number // 1-5
  label: string
  trend: 'improving' | 'stable' | 'declining' | 'new'
  reasons: string[]
}

// ── Scoring weights (additive, explainable) ─────────────────────────────────
const W = {
  paidBeforeDue: 12,
  paidWithin7: 6,
  promisesKept: 10,
  promisesBroken: -14,
  remindersRead: 4,
  overdue30plus: -10,
  requiredCalls: -6,
  failedReminders: -3,
}

const LABELS = [
  { min: 80, stars: 5, label: 'Trusted' },
  { min: 60, stars: 4, label: 'Reliable' },
  { min: 40, stars: 3, label: 'Average' },
  { min: 20, stars: 2, label: 'Needs Follow-up' },
  { min: 0, stars: 1, label: 'High Recovery Effort' },
]

export function scoreRelationship(input: RelationshipInput): RelationshipScore {
  const r = input
  let points = 40 // neutral baseline — most customers start "average"
  const reasons: string[] = []

  if ((r.paidBeforeDue ?? 0) > 0) {
    points += W.paidBeforeDue * Math.min(r.paidBeforeDue!, 3)
    reasons.push('Pays before the due date')
  }
  if ((r.paidWithin7 ?? 0) > 0) {
    points += W.paidWithin7 * Math.min(r.paidWithin7!, 3)
    reasons.push('Usually pays within a week')
  }
  if ((r.promisesKept ?? 0) > 0) {
    points += W.promisesKept * Math.min(r.promisesKept!, 2)
    reasons.push('Keeps payment promises')
  }
  if ((r.remindersRead ?? 0) > 0) {
    const ratio = (r.remindersSent ?? 0) > 0 ? r.remindersRead! / r.remindersSent! : 1
    if (ratio >= 0.5) {
      points += W.remindersRead
      reasons.push('Responds to reminders')
    }
  }
  if ((r.promisesBroken ?? 0) > 0) {
    points += W.promisesBroken * Math.min(r.promisesBroken!, 2)
    reasons.push('Has broken payment promises')
  }
  if ((r.overdue30plus ?? 0) > 0) {
    points += W.overdue30plus * Math.min(r.overdue30plus!, 2)
    reasons.push('Frequently overdue beyond 30 days')
  }
  if ((r.requiredCalls ?? 0) > 0) {
    points += W.requiredCalls * Math.min(r.requiredCalls!, 2)
    reasons.push('Usually needs a phone call to pay')
  }
  if ((r.failedReminders ?? 0) > 0) {
    points += W.failedReminders * Math.min(r.failedReminders!, 2)
    reasons.push('Misses some reminders')
  }

  const score = Math.max(0, Math.min(100, Math.round(points)))
  const band = LABELS.find((l) => score >= l.min)!

  if (reasons.length === 0) reasons.push('Not enough history yet')

  return {
    score,
    stars: band.stars,
    label: band.label,
    trend: 'new',
    reasons,
  }
}

/**
 * Combine a historical score with recent signals to derive a trend.
 * `prior` is the previously stored score (if any); `current` is freshly computed.
 */
export function deriveTrend(prior: number | null, current: number): RelationshipScore['trend'] {
  if (prior == null) return 'new'
  const delta = current - prior
  if (delta >= 5) return 'improving'
  if (delta <= -5) return 'declining'
  return 'stable'
}

export function stars(n: number): string {
  return '★'.repeat(n) + '☆'.repeat(5 - n)
}
