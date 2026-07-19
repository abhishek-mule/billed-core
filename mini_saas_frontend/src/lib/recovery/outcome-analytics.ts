/**
 * Outcome Analytics — measures OUTCOMES OF ACTIONS, not risky attribution.
 *
 * Design rules (per product spec):
 *  - Never claim "X recovered ₹Y" unless certain. We report "recovered AFTER action".
 *  - A payment may follow multiple touches; we count outcomes per action, not
 *    exclusive credit.
 *  - This module is the foundation for the Behavioral Engine: it returns raw,
 *    explainable action-outcome stats that later learning layers consume.
 *
 * All data comes from the frozen event store: collection_actions +
 * collection_action_events. No new infrastructure.
 */

export interface ActionOutcome {
  actionType: string
  sent: number
  paid: number // payment received within the window after this action
  promised: number // promise made within the window
  ignored: number // completed but no payment/promise (or failed)
  recoveryRate: number // paid / sent
  avgDaysToPayment: number | null
}

export interface PromiseAnalytics {
  total: number
  kept: number
  broken: number
  keptRate: number
  avgDaysLate: number | null
}

export interface CommunicationAnalytics {
  delivered: number
  read: number
  failed: number
  ignored: number // delivered but never read
  readRate: number
}

export interface OutcomeAnalytics {
  windowDays: number
  reminders: ActionOutcome
  phoneCalls: ActionOutcome
  promises: PromiseAnalytics
  whatsapp: CommunicationAnalytics
}

const DAY = 86400000

function emptyAction(actionType: string): ActionOutcome {
  return { actionType, sent: 0, paid: 0, promised: 0, ignored: 0, recoveryRate: 0, avgDaysToPayment: null }
}

function finalize(a: ActionOutcome) {
  a.recoveryRate = a.sent > 0 ? Math.round((a.paid / a.sent) * 100) : 0
  return a
}

export interface OutcomeInput {
  /** completed collection_actions with action_type, status, scheduled_at, completed_at, invoice_ids */
  actions: Array<{
    id: string
    action_type: string
    status: string
    scheduled_at: string | null
    completed_at: string | null
    invoice_ids: string[] | null
  }>
  /** collection_action_events for those actions */
  events: Array<{
    action_id: string
    event_type: string
    to_status: string | null
    created_at: string
    payload?: any
  }>
  /** payment events (event_type = payment_received) keyed by action_id */
  paymentEvents: Array<{ action_id: string; created_at: string; amount?: number }>
  /** promise records */
  promises: Array<{ status: string; promise_date: string | null; created_at: string; paid_at?: string | null }>
  windowDays: number
}

export function computeOutcomeAnalytics(input: OutcomeInput): OutcomeAnalytics {
  const { windowDays } = input
  const windowMs = windowDays * DAY

  const eventsByAction = new Map<string, typeof input.events>()
  for (const e of input.events) {
    const arr = eventsByAction.get(e.action_id) || []
    arr.push(e)
    eventsByAction.set(e.action_id, arr)
  }

  const payByAction = new Map<string, typeof input.paymentEvents>()
  for (const p of input.paymentEvents) {
    const arr = payByAction.get(p.action_id) || []
    arr.push(p)
    payByAction.set(p.action_id, arr)
  }

  const reminders = emptyAction('reminder')
  const phoneCalls = emptyAction('call')

  for (const a of input.actions) {
    const completedAt = a.completed_at ? new Date(a.completed_at).getTime() : null
    const isReminder = a.action_type === 'reminder' || a.action_type === 'payment_request'
    const isCall = a.action_type === 'call'
    if (!isReminder && !isCall) continue
    if (a.status !== 'completed' && a.status !== 'cancelled') continue

    const target = isReminder ? reminders : phoneCalls
    target.sent++

    // Payment received within window after this action?
    const pays = (payByAction.get(a.id) || []).filter(
      (p) => completedAt == null || new Date(p.created_at).getTime() - completedAt <= windowMs
    )
    if (pays.length > 0) {
      target.paid++
      if (completedAt != null) {
        const days = pays.map((p) => (new Date(p.created_at).getTime() - completedAt) / DAY)
        target.avgDaysToPayment =
          target.avgDaysToPayment == null
            ? Math.round((days.reduce((s, d) => s + d, 0) / days.length) * 10) / 10
            : target.avgDaysToPayment
      }
    }

    // Promise made within window?
    const evs = eventsByAction.get(a.id) || []
    const promised = evs.some(
      (e) =>
        e.event_type === 'promise_made' &&
        (completedAt == null || new Date(e.created_at).getTime() - completedAt <= windowMs)
    )
    if (promised) target.promised++
    else if (target.paid === 0) target.ignored++
  }

  finalize(reminders)
  finalize(phoneCalls)

  // Promise analytics
  const total = input.promises.length
  const kept = input.promises.filter((p) => p.status === 'kept' || p.status === 'fulfilled').length
  const broken = input.promises.filter((p) => p.status === 'broken' || p.status === 'failed').length
  const lateDays: number[] = []
  for (const p of input.promises) {
    if ((p.status === 'broken' || p.status === 'failed') && p.promise_date) {
      const late = (p.paid_at ? new Date(p.paid_at).getTime() : Date.now()) - new Date(p.promise_date).getTime()
      if (late > 0) lateDays.push(Math.round(late / DAY))
    }
  }
  const promises: PromiseAnalytics = {
    total,
    kept,
    broken,
    keptRate: total > 0 ? Math.round((kept / total) * 100) : 0,
    avgDaysLate: lateDays.length ? Math.round(lateDays.reduce((s, d) => s + d, 0) / lateDays.length) : null,
  }

  // Communication analytics (from whatsapp-style events present in collection_action_events)
  const waEvents = input.events.filter((e) => e.event_type === 'delivered' || e.event_type === 'read' || e.event_type === 'failed')
  const delivered = waEvents.filter((e) => e.event_type === 'delivered').length
  const read = waEvents.filter((e) => e.event_type === 'read').length
  const failed = waEvents.filter((e) => e.event_type === 'failed').length
  const ignored = delivered > 0 ? Math.max(0, delivered - read) : 0
  const whatsapp: CommunicationAnalytics = {
    delivered,
    read,
    failed,
    ignored,
    readRate: delivered > 0 ? Math.round((read / delivered) * 100) : 0,
  }

  return { windowDays, reminders, phoneCalls, promises, whatsapp }
}
