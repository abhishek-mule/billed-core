/**
 * Recovery Decision — single authoritative "next best action" for a customer.
 *
 * Built ONCE server-side from recorded evidence (invoices, collection_actions,
 * collection_action_events, whatsapp_events, payment_promises). Every UI surface
 * (recovery queue, customer workspace, invoice detail) consumes this same object
 * so no surface independently recreates the decision and they can never disagree.
 *
 * PRINCIPLE: the decision is grounded in RECORDED EVENTS, never UI heuristics.
 * A state like "waiting" is only emitted when a provider actually accepted the
 * message (status sent/delivered/read). We never claim a reminder was sent when
 * the event log says otherwise.
 *
 * DECISION HIERARCHY (evidence-based, not age-based):
 * 1. No phone → blocked_phone
 * 2. Active promise → waiting (monitor)
 * 3. Broken promise → call
 * 4. Reminder delivered/read but no response for 3+ days → call (evidence-based)
 * 5. Reminder in flight (sent/delivered/read) → waiting
 * 6. Reminder failed → remind (retry)
 * 7. No reminder ever sent → remind
 * 8. High urgency (30+ days) with NO contact attempted → remind (not call)
 * 9. High urgency with contact attempted but ineffective → call
 */

export type DecisionState =
  | 'blocked_phone'     // needs a phone number first
  | 'recovered'         // outstanding is zero
  | 'call'              // call the customer (broken promise / evidence of WhatsApp ineffectiveness)
  | 'remind'            // send a WhatsApp reminder
  | 'waiting'           // a reminder is in flight (sent/delivered/read) within waiting window
  | 'blocked_transport' // transport permanently failed (invalid number, template rejected, etc.)
  | 'none'

export type InvoiceDecision = {
  invoiceId: string
  number: string
  amount: number
  overdueDays: number
  state: 'remind' | 'call' | 'waiting' | 'recovered'
  // strongest delivery milestone recorded for this invoice
  delivery: 'read' | 'delivered' | 'sent' | null
  // most recent action/event timestamp evidence
  lastEvidenceAt: string | null
}

export type RecoveryDecision = {
  state: DecisionState
  headline: string      // short action: "Send reminder", "Call customer", "Add phone number"
  reason: string        // the WHY, grounded in evidence
  targetInvoiceId: string | null // the specific invoice driving the decision
  invoices: InvoiceDecision[]
  generatedAt: string
}

interface DecisionRow {
  invoices: {
    id: string
    number: string | null
    outstanding: number
    dueDate: string | null
    status: string
    createdAt: string
  }[]
  customerPhone?: string | null
  actions: {
    id: string
    actionType: string
    status: string
    invoiceIds: string[]
    completedAt: string | null
  }[]
  deliveryByAction: Record<
    string,
    { sentAt?: string; deliveredAt?: string; readAt?: string; failedAt?: string }
  >
  promises?: {
    id: string
    promiseDate: string
    status: 'active' | 'fulfilled' | 'broken'
    createdAt: string
  }[]
  replies?: {
    at: string
    preview: string | null
  }[]
}

const fmt = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN')

function daysOverdue(dueDate: string | null): number {
  if (!dueDate) return 0
  const ms = Date.now() - new Date(dueDate).getTime()
  const days = Math.floor(ms / 86400000)
  return days > 0 ? days : 0
}

/**
 * Build the single authoritative next-best-action for one customer from recorded
 * evidence. Safe to call from any surface.
 */
export function buildRecoveryDecision(row: DecisionRow): RecoveryDecision {
  const now = new Date().toISOString()
  const nowMs = Date.now()

  // Customer-level phone blocker prevents ALL WhatsApp recovery.
  if (!row.customerPhone) {
    return {
      state: 'blocked_phone',
      headline: 'Add phone number',
      reason: 'WhatsApp recovery cannot start without a customer number.',
      targetInvoiceId: null,
      invoices: [],
      generatedAt: now,
    }
  }

  // Helper: check if WhatsApp transport is permanently blocked for this customer
  // (invalid number, blocked, template rejected, token expired, etc.)
  const hasPermanentTransportFailure = (actions: typeof row.actions, deliveryByAction: typeof row.deliveryByAction) => {
    for (const a of actions) {
      const d = deliveryByAction[a.id]
      if (!d) continue
      if (d.failedAt) {
        // In a real implementation, check failure reason from whatsapp_events
        // For now, treat any failed delivery as potentially permanent if no subsequent success
        const hasLaterSuccess = actions.some(a2 => {
          const d2 = deliveryByAction[a2.id]
          return d2 && (d2.sentAt || d2.deliveredAt || d2.readAt) && new Date(d2.sentAt || d2.deliveredAt || d2.readAt!) > new Date(d.failedAt!)
        })
        if (!hasLaterSuccess) return true
      }
    }
    return false
  }

  // If transport is permanently blocked, escalate to human
  if (hasPermanentTransportFailure(row.actions, row.deliveryByAction)) {
    const allOpen = row.invoices.filter(i => i.status !== 'paid')
    const urgent = allOpen.sort((a, b) => (b.outstanding || 0) - (a.outstanding || 0))[0]
    return {
      state: 'blocked_transport',
      headline: 'Fix WhatsApp delivery',
      reason: 'WhatsApp reminders are failing permanently (invalid number, blocked, or template issue). Manual intervention required.',
      targetInvoiceId: urgent?.id || null,
      invoices: [],
      generatedAt: now,
    }
  }

  // Per-invoice decision from correlated action/event evidence.
  const invoices: InvoiceDecision[] = []

  for (const inv of row.invoices) {
    if (inv.status === 'paid') {
      invoices.push({
        invoiceId: inv.id,
        number: inv.number || inv.id.slice(0, 8),
        amount: inv.outstanding,
        overdueDays: 0,
        state: 'recovered',
        delivery: null,
        lastEvidenceAt: null,
      })
      continue
    }

    // Correlate this invoice's actions (collection_actions.invoice_ids contains it)
    const invoiceActions = row.actions.filter((a) =>
      a.invoiceIds && a.invoiceIds.includes(inv.id),
    )

    // Collect delivery telemetry across that invoice's actions
    let delivery: 'read' | 'delivered' | 'sent' | null = null
    let lastEvidenceAt: string | null = null
    let anyAccepted = false
    let anyFailed = false
    let anyRead = false
    for (const a of invoiceActions) {
      const d = row.deliveryByAction[a.id]
      if (!d) continue
      if (a.completedAt && (!lastEvidenceAt || a.completedAt > lastEvidenceAt)) lastEvidenceAt = a.completedAt
      if (d.failedAt) anyFailed = true
      if (d.readAt) { delivery = 'read'; anyAccepted = true; anyRead = true; if (!lastEvidenceAt || d.readAt > lastEvidenceAt) lastEvidenceAt = d.readAt }
      else if (d.deliveredAt) { delivery = 'delivered'; anyAccepted = true; if (!lastEvidenceAt || d.deliveredAt > lastEvidenceAt) lastEvidenceAt = d.deliveredAt }
      else if (d.sentAt) { delivery = 'sent'; anyAccepted = true; if (!lastEvidenceAt || d.sentAt > lastEvidenceAt) lastEvidenceAt = d.sentAt }
    }

    const od = daysOverdue(inv.dueDate)

    // Resolve per-invoice state from RECORDED evidence:
    //  - provider accepted (sent/delivered/read) AND within waiting window -> waiting
    //  - provider accepted BUT waiting window expired -> remind (next cycle)
    //  - failed with no acceptance                 -> remind (retry)
    //  - no recorded event                         -> remind (not yet contacted)
    //  - NO blanket "overdue > X days = call" override
    let state: 'remind' | 'call' | 'waiting'
    if (!anyAccepted) {
      state = 'remind' // never contacted or all failed
    } else {
      // Define waiting window: 3 days for sent/delivered, 1 day for read
      const waitingWindowMs = delivery === 'read' ? 1 * 86400000 : 3 * 86400000
      const isWithinWaitingWindow = lastEvidenceAt && (nowMs - new Date(lastEvidenceAt).getTime()) < waitingWindowMs
      if (isWithinWaitingWindow) {
        state = 'waiting' // reminder in flight, awaiting response
      } else {
        state = 'remind' // waiting window expired, next reminder cycle
      }
    }
    // REMOVED: if (od > 15) state = 'call'  ← This was the bug

    invoices.push({
      invoiceId: inv.id,
      number: inv.number || inv.id.slice(0, 8),
      amount: inv.outstanding,
      overdueDays: od,
      state,
      delivery,
      lastEvidenceAt,
    })
  }

  const open = invoices.filter((i) => i.state !== 'recovered')

  // All recovered
  if (open.length === 0) {
    return {
      state: 'recovered',
      headline: 'Recovered',
      reason: 'All invoices paid.',
      targetInvoiceId: null,
      invoices,
      generatedAt: now,
    }
  }

  // BEHAVIORAL PRIORITY HIERARCHY (evidence-first, not age-first)

  // Priority 1: Active promise — don't spam during promise window
  const activePromise = (row.promises || []).find(p => p.status === 'active')
  if (activePromise) {
    const promiseDate = new Date(activePromise.promiseDate)
    const nowDate = new Date(now)
    if (promiseDate > nowDate) {
      const urgent = [...open].sort((a, b) => b.amount - a.amount)[0]
      return {
        state: 'waiting',
        headline: 'Monitoring promise',
        reason: `Customer promised payment by ${promiseDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}. BillZo is waiting.`,
        targetInvoiceId: urgent.invoiceId,
        invoices,
        generatedAt: now,
      }
    }
  }

  // Priority 2: Broken promise — escalate immediately (human intervention needed)
  const brokenPromises = (row.promises || []).filter(p => p.status === 'broken')
  if (brokenPromises.length > 0) {
    const urgent = [...open].sort((a, b) => b.amount - a.amount)[0]
    return {
      state: 'call',
      headline: 'Call customer',
      reason: `Customer broke ${brokenPromises.length} payment promise${brokenPromises.length > 1 ? 's' : ''}. Call needed to resolve.`,
      targetInvoiceId: urgent.invoiceId,
      invoices,
      generatedAt: now,
    }
  }

  // Priority 3: Evidence-based escalation — reminder read but ignored for 3+ days
  // This is the ONLY path to "call" based on overdue + communication evidence
  const readButIgnored = open.find(i =>
    i.delivery === 'read' &&
    i.overdueDays > 15 && // still require meaningful overdue
    i.lastEvidenceAt &&
    (nowMs - new Date(i.lastEvidenceAt).getTime()) > 3 * 86400000 // 3 days since read
  )
  if (readButIgnored && !(row.replies || []).length) {
    return {
      state: 'call',
      headline: 'Call customer',
      reason: `Reminder on ${readButIgnored.number} was read ${Math.round((nowMs - new Date(readButIgnored.lastEvidenceAt!).getTime()) / 86400000)} days ago but ignored. WhatsApp ineffective — call needed.`,
      targetInvoiceId: readButIgnored.invoiceId,
      invoices,
      generatedAt: now,
    }
  }

  // Priority 3.5: Transport permanently blocked (invalid number, template rejected, etc.)
  // This is a merchant-actionable blocker, not an automation issue
  const hasTransportFailure = open.some(i => i.delivery === null && i.lastEvidenceAt === null && row.actions.some(a => {
    const d = row.deliveryByAction[a.id]
    return d && d.failedAt && !row.actions.some(a2 => {
      const d2 = row.deliveryByAction[a2.id]
      return d2 && (d2.sentAt || d2.deliveredAt || d2.readAt) && new Date(d2.sentAt || d2.deliveredAt || d2.readAt!) > new Date(d.failedAt!)
    })
  }))
  if (hasTransportFailure) {
    const failedInvoice = open.find(i => row.actions.some(a => {
      const d = row.deliveryByAction[a.id]
      return d && d.failedAt && !row.actions.some(a2 => {
        const d2 = row.deliveryByAction[a2.id]
        return d2 && (d2.sentAt || d2.deliveredAt || d2.readAt) && new Date(d2.sentAt || d2.deliveredAt || d2.readAt!) > new Date(d.failedAt!)
      })
    }))
    return {
      state: 'blocked_transport',
      headline: 'Fix WhatsApp delivery',
      reason: `WhatsApp reminders are failing permanently (invalid number, blocked, or template issue). Manual intervention required.`,
      targetInvoiceId: failedInvoice?.invoiceId || null,
      invoices,
      generatedAt: now,
    }
  }

  // Priority 4: Reminder delivered but not read for extended period (7+ days overdue, 5+ days since delivery)
  // Only escalate if there's been reasonable time for the customer to see it
  const deliveredButSilent = open.find(i =>
    (i.delivery === 'delivered' || i.delivery === 'sent') &&
    i.overdueDays > 30 && // high urgency threshold
    i.lastEvidenceAt &&
    (nowMs - new Date(i.lastEvidenceAt!).getTime()) > 5 * 86400000 // 5 days since delivery
  )
  if (deliveredButSilent && !(row.replies || []).length) {
    return {
      state: 'call',
      headline: 'Call customer',
      reason: `Reminder on ${deliveredButSilent.number} was delivered ${Math.round((nowMs - new Date(deliveredButSilent.lastEvidenceAt!).getTime()) / 86400000)} days ago with no response. High urgency (${deliveredButSilent.overdueDays}d overdue) — call needed.`,
      targetInvoiceId: deliveredButSilent.invoiceId,
      invoices,
      generatedAt: now,
    }
  }

  // Priority 5: High urgency (30+ days) but NO reminder ever sent → remind, don't call
  // BillZo should attempt WhatsApp first before escalating to human
  const criticalOverdue = open.find(i => i.overdueDays > 30)
  if (criticalOverdue && !criticalOverdue.delivery && !criticalOverdue.lastEvidenceAt) {
    return {
      state: 'remind',
      headline: 'Send reminder',
      reason: `${criticalOverdue.number} is ${criticalOverdue.overdueDays} days overdue — ${fmt(criticalOverdue.amount)}. No reminder sent yet. Starting WhatsApp recovery.`,
      targetInvoiceId: criticalOverdue.invoiceId,
      invoices,
      generatedAt: now,
    }
  }

  // Priority 6: Pick the most urgent invoice using standard logic
  const urgent = [...open].sort((a, b) => {
    // Prefer invoices with reminders in flight (waiting) over those never contacted
    if (a.state === 'waiting' && b.state !== 'waiting') return -1
    if (b.state === 'waiting' && a.state !== 'waiting') return 1
    // Then by overdue days
    if (a.overdueDays !== b.overdueDays) return b.overdueDays - a.overdueDays
    // Then by amount
    return b.amount - a.amount
  })[0]

  let state: DecisionState
  let headline: string
  let reason: string

  if (urgent.state === 'call') {
    state = 'call'
    headline = 'Call customer'
    reason = `${urgent.number} — ${fmt(urgent.amount)} overdue ${urgent.overdueDays} days.`
  } else if (urgent.state === 'waiting') {
    state = 'waiting'
    headline = 'Monitoring'
    reason = `Reminder on ${urgent.number} delivered (${urgent.delivery || 'sent'}). Awaiting customer response.`
  } else {
    state = 'remind'
    headline = 'Send reminder'
    reason = `${urgent.number} — ${fmt(urgent.amount)} overdue ${urgent.overdueDays} days. No reminder sent yet.`
  }

  return {
    state,
    headline,
    reason,
    targetInvoiceId: urgent.invoiceId,
    invoices,
    generatedAt: now,
  }
}