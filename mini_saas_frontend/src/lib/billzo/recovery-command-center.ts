import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import { buildRecoveryDecision, type RecoveryDecision } from './recovery-decision'
import { computeAutomationState, type AutomationState } from './recovery-evaluation'
import { escalationDecision } from '@billzo/shared'

// Product rule: "Recovered this month" = merchant-local calendar month (Asia/Kolkata), not UTC.
// 00:00 IST on the 1st = 18:30 UTC previous day. Boundary is documented here so a future UTC
// change would require a product decision, not a silent code edit.
function monthStartIST(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit' }).formatToParts(now)
  const y = Number(parts.find((p) => p.type === 'year')!.value)
  const m = Number(parts.find((p) => p.type === 'month')!.value)
  // 19800000 ms = 5h30m IST offset
  return new Date(Date.UTC(y, m - 1, 1) - 19_800_000).toISOString()
}

/**
 * Recovery Card — flat card for the Recovery Command Center
 * One card = one customer = one decision = one dominant CTA
 * Sections: NEEDS YOU | BILLZO IS HANDLING | MONITORING
 */

export type RecoveryCard = {
  caseId: string | null
  customerId: string
  customerName: string
  phone: string | null
  outstanding: number
  invoiceCount: number
  maxOverdueDays: number
  section: 'needs_you' | 'automated' | 'monitoring' | 'exhausted'
  state: RecoveryDecision['state']
  headline: string
  reason: string
  targetInvoiceId: string | null
  evidence: {
    lastDelivery: { status: 'read' | 'delivered' | 'sent' | 'failed' | null; at: string | null }
    replied: boolean
    replyPreview: string | null
    promiseDate: string | null
  }
  automation: AutomationState
  /** Phase C — machinery-equivalent of assessRecoveryCase.recommended (Urgent+ rule). */
  escalationRecommended: boolean
  cta: {
    type: 'add_phone' | 'call' | 'send_reminder' | 'view_details' | 'view_payment'
    label: string
    href?: string
  }
}

export type RecoveryCommandCenter = {
  summary: {
    totalCases: number
    needsYou: number
    automated: number
    monitoring: number
    exhausted: number
    totalOutstanding: number
    escalationRecommended: number
    /** Authoritative — derived from payments ledger (status=paid, created_at in current month), not attributions. */
    recoveredThisMonth: number
  }
  automation: {
    scheduledActions: number
    awaitingEvaluation: number
    pausedByReply: number
    pausedByPromise: number
  }
  needsYou: RecoveryCard[]
  billzoIsHandling: RecoveryCard[]
  monitoring: RecoveryCard[]
  exhausted: RecoveryCard[]
  /** Presentation-only grouped timeline — no new authority. Sources: payments(paid), collection_actions, whatsapp_events delivery. */
  recentRecovery: RecentRecoveryItem[]
  generatedAt: string
}

export type RecentRecoveryItem = {
  id: string
  kind: 'payment' | 'reminder'
  customerId: string | null
  customerName: string
  amount: number | null
  invoiceNumber: string | null
  title: string
  detail: string
  occurredAt: string
  status: 'paid' | 'delivered' | 'sent' | 'read' | 'failed' | 'waiting'
}

const ACTIVE_STATES = ['active', 'overdue', 'partial_payment', 'promised', 'disputed']

const invoiceOutstanding = (i: any) =>
  Number(i.outstanding_amount) > 0
    ? Number(i.outstanding_amount)
    : Math.max(0, (Number(i.grand_total || i.total || 0)) - (Number(i.paid_amount) || 0))

function sectionFor(state: RecoveryDecision['state']): 'needs_you' | 'automated' | 'monitoring' | 'exhausted' {
  switch (state) {
    case 'blocked_phone': return 'needs_you'
    case 'call': return 'needs_you'
    case 'blocked_transport': return 'needs_you'
    case 'exhausted': return 'exhausted'
    case 'remind': return 'automated'
    case 'waiting': return 'monitoring'
    case 'recovered': return 'monitoring'
    default: return 'monitoring'
  }
}

function buildCTA(decision: RecoveryDecision, phone: string | null, customerId: string) {
  switch (decision.state) {
    case 'blocked_phone':
      return { type: 'add_phone' as const, label: 'Add phone number' }
    case 'blocked_transport':
      return { type: 'view_details' as const, label: 'View details' }
    case 'call':
      if (phone) return { type: 'call' as const, label: 'Call customer', href: `tel:${phone}` }
      return { type: 'add_phone' as const, label: 'Add phone number' }
    case 'remind':
      return { type: 'send_reminder' as const, label: 'Send reminder' }
    case 'waiting':
      return { type: 'view_details' as const, label: 'View details' }
    case 'exhausted':
      return { type: 'view_details' as const, label: 'View details' }
    case 'recovered':
      return { type: 'view_payment' as const, label: 'View payment' }
    default:
      return { type: 'view_details' as const, label: 'View details' }
  }
}

export async function getRecoveryCommandCenter(tenantId: string): Promise<RecoveryCommandCenter> {
  const now = new Date()

  // ── Open cases ──
  const { data: cases } = await supabaseAdmin
    .from('recovery_cases')
    .select('id, customer_id, total_outstanding, recovery_state_v2, engagement_state_v2, next_action_type, next_action_due_at, last_activity_at, created_at')
    .eq('tenant_id', tenantId)
    .gt('total_outstanding', 0)
    .in('recovery_state_v2', ACTIVE_STATES)
    .limit(100)

  const customerIds = [...new Set((cases || []).map((c: any) => c.customer_id).filter(Boolean))]
if (customerIds.length === 0) {
      // Still report financials from ledger even with zero recovery_cases — matches Home/Invoices which sum all open invoices.
      const monthStart = monthStartIST(now)
      let recoveredThisMonth = 0
      let totalOutstanding = 0
      try {
        const [{ data: monthPayments }, { data: allInvoices }] = await Promise.all([
          supabaseAdmin.from('payments').select('amount').eq('tenant_id', tenantId).eq('status', 'paid').gte('created_at', monthStart),
          supabaseAdmin.from('invoices').select('grand_total, total, paid_amount, outstanding_amount, status').eq('tenant_id', tenantId).limit(1000),
        ])
        recoveredThisMonth = (monthPayments || []).reduce((s: number, p: any) => s + (parseFloat(p.amount) || 0), 0)
        for (const inv of allInvoices || []) {
          if ((inv.status as string) !== 'paid' && (inv.status as string) !== 'cancelled') totalOutstanding += invoiceOutstanding(inv as any)
        }
      } catch {
        recoveredThisMonth = 0
      }
      return {
      summary: { totalCases: 0, needsYou: 0, automated: 0, monitoring: 0, exhausted: 0, totalOutstanding, escalationRecommended: 0, recoveredThisMonth },
       automation: { scheduledActions: 0, awaitingEvaluation: 0, pausedByReply: 0, pausedByPromise: 0 },
        needsYou: [],
      billzoIsHandling: [],
      monitoring: [],
      exhausted: [],
      recentRecovery: [],
      generatedAt: now.toISOString(),
    }
  }

  const caseByCust = new Map<string, any>()
  for (const c of cases || []) {
    if (c.customer_id) caseByCust.set(c.customer_id, c)
  }

  const [customersRes, invoicesRes, actionsRes, promisesRes, sessionsRes, eventsRes] = await Promise.all([
    supabaseAdmin
      .from('customers')
      .select('id, customer_name, phone, customer_tier, automation_mode')
      .in('id', customerIds),
    supabaseAdmin
      .from('invoices')
      .select('id, customer_id, invoice_number, total, grand_total, paid_amount, outstanding_amount, status, due_date, created_at, recovery_stage, next_recovery_at, last_whatsapp_at')
      .eq('tenant_id', tenantId)
      .in('customer_id', customerIds)
      .limit(500),
    supabaseAdmin
      .from('collection_actions')
      .select('id, customer_id, action_type, status, scheduled_at, completed_at, invoice_ids, reason')
      .eq('tenant_id', tenantId)
      .in('customer_id', customerIds)
      .limit(500),
    supabaseAdmin
      .from('payment_promises')
      .select('id, customer_id, promise_date, status')
      .eq('tenant_id', tenantId)
      .in('customer_id', customerIds)
      .limit(500),
    supabaseAdmin
      .from('recovery_sessions')
      .select('id, customer_id, outcome')
      .eq('tenant_id', tenantId)
      .in('customer_id', customerIds)
      .limit(500),
    supabaseAdmin
      .from('recovery_case_events')
      .select('event_type, payload, case_id')
      .in('case_id', (cases || []).map((c: any) => c.id))
      .limit(2000),
  ])

  const customers = customersRes.data || []
  const invoices = invoicesRes.data || []
  const actions = actionsRes.data || []
  const promises = promisesRes.data || []
  const sessions = sessionsRes.data || []
  const events = eventsRes.data || []

  const actionIds = (actions || []).map((a: any) => a.id).filter(Boolean)
  const { data: waEvents } = actionIds.length
    ? await supabaseAdmin
        .from('whatsapp_events')
        .select('recovery_attempt_id, delivered_at, read_at, occurred_at, status, direction, message_preview')
        .eq('tenant_id', tenantId)
        .in('recovery_attempt_id', actionIds)
        .limit(2000)
    : { data: [] as any[] }

  const waByAction = new Map<string, any[]>()
  for (const w of waEvents || []) {
    const key = w.recovery_attempt_id
    if (key) waByAction.set(key, [...(waByAction.get(key) || []), w])
  }

  const custMap = new Map(customers.map((c: any) => [c.id, c]))
  const invByCust = new Map<string, any[]>()
  for (const inv of invoices) {
    const arr = invByCust.get(inv.customer_id) || []
    arr.push(inv)
    invByCust.set(inv.customer_id, arr)
  }
  const actionsByCust = new Map<string, any[]>()
  for (const a of actions) {
    const arr = actionsByCust.get(a.customer_id) || []
    arr.push(a)
    actionsByCust.set(a.customer_id, arr)
  }
  const promisesByCust = new Map<string, any[]>()
  for (const p of promises) {
    const arr = promisesByCust.get(p.customer_id) || []
    arr.push(p)
    promisesByCust.set(p.customer_id, arr)
  }
  const sessionsByCust = new Map<string, any[]>()
  for (const s of sessions) {
    const arr = sessionsByCust.get(s.customer_id) || []
    arr.push(s)
    sessionsByCust.set(s.customer_id, arr)
  }
  const caseIdByCust = new Map<string, string>()
  for (const c of cases || []) {
    if (c.customer_id && c.id) caseIdByCust.set(c.customer_id, c.id)
  }
  const eventsByCase = new Map<string, any[]>()
  for (const ev of events) {
    const arr = eventsByCase.get(ev.case_id) || []
    arr.push(ev)
    eventsByCase.set(ev.case_id, arr)
  }

  const cards: RecoveryCard[] = []

  for (const custId of customerIds) {
    const cust = custMap.get(custId) || {}
    const custInvoices = invByCust.get(custId) || []
    if (custInvoices.length === 0) continue
    const caseRow = caseByCust.get(custId) || {}

    const custActions = actionsByCust.get(custId) || []
    const deliveryByAction: Record<string, any> = {}
    for (const a of custActions) {
      const rows = waByAction.get(a.id) || []
      const sent = rows.filter((r: any) => r.status === 'sent').map((r: any) => r.occurred_at)
      const delivered = rows.filter((r: any) => r.delivered_at).map((r: any) => r.delivered_at)
      const read = rows.filter((r: any) => r.read_at).map((r: any) => r.read_at)
      const failed = rows.filter((r: any) => r.status === 'failed').map((r: any) => r.occurred_at)
      deliveryByAction[a.id] = {
        sentAt: sent.length ? sent[sent.length - 1] : undefined,
        deliveredAt: delivered.length ? delivered[delivered.length - 1] : undefined,
        readAt: read.length ? read[read.length - 1] : undefined,
        failedAt: failed.length ? failed[failed.length - 1] : undefined,
      }
    }

    const outstanding = custInvoices.reduce((s: number, i: any) => s + invoiceOutstanding(i), 0)
    if (outstanding <= 0) continue

    // Prepare promises data
    const custPromises = (promisesByCust.get(custId) || []).map((p: any) => ({
      id: p.id,
      promiseDate: p.promise_date,
      status: p.status as 'active' | 'fulfilled' | 'broken',
      createdAt: p.created_at || new Date().toISOString(),
    }))

    // Prepare replies data from inbound WhatsApp events
    const allWa = custActions.flatMap((a: any) => waByAction.get(a.id) || [])
    const inboundReplies = allWa
      .filter((w: any) => w.direction === 'inbound')
      .map((w: any) => ({
        at: w.occurred_at,
        preview: w.message_preview,
      }))
      .sort((a: any, b: any) => +new Date(b.at) - +new Date(a.at))

    const decision = buildRecoveryDecision({
      customerPhone: cust.phone ?? null,
      invoices: custInvoices.map((i: any) => ({
        id: i.id,
        number: i.invoice_number,
        outstanding: invoiceOutstanding(i),
        dueDate: i.due_date,
        status: i.status,
        createdAt: i.created_at,
      })),
      actions: custActions.map((a: any) => ({
        id: a.id,
        actionType: a.action_type,
        status: a.status,
        invoiceIds: a.invoice_ids || [],
        completedAt: a.completed_at,
      })),
      deliveryByAction,
      promises: custPromises,
      replies: inboundReplies,
      recoveryState: caseRow.recovery_state_v2 ?? null,
      nextActionType: caseRow.next_action_type ?? null,
    })

    const inbound = allWa.filter((w: any) => w.direction === 'inbound')
    const latestInbound = inbound.sort(
      (x: any, y: any) => +new Date(y.occurred_at || 0) - +new Date(x.occurred_at || 0),
    )[0]

    const completedActions = custActions
      .filter((a: any) => a.status === 'completed' || a.status === 'in_progress')
      .sort(
        (x: any, y: any) =>
          +new Date(y.completed_at || y.scheduled_at || 0) - +new Date(x.completed_at || x.scheduled_at || 0),
      )
    const lastAction = completedActions[0] || custActions[0]

    let lastDelivery: { status: 'read' | 'delivered' | 'sent' | 'failed' | null; at: string | null } =
      { status: null, at: null }
    for (const a of custActions) {
      const d = deliveryByAction[a.id]
      if (!d) continue
      const candidate: { status: 'read' | 'delivered' | 'sent' | 'failed'; at: string } | null =
        d.readAt ? { status: 'read', at: d.readAt } :
        d.deliveredAt ? { status: 'delivered', at: d.deliveredAt } :
        d.sentAt ? { status: 'sent', at: d.sentAt } :
        d.failedAt ? { status: 'failed', at: d.failedAt } : null
      if (candidate && (!lastDelivery.at || +new Date(candidate.at) > +new Date(lastDelivery.at))) {
        lastDelivery = candidate
      }
    }

    const activePromise = (promisesByCust.get(custId) || []).filter((p: any) => p.status === 'active')[0]

    const maxOverdueDays = decision.invoices.length
      ? Math.max(...decision.invoices.map((inv) => inv.overdueDays))
      : 0

    // Phase C — escalate any open case off the same Urgent+ rule the
    // assessRecoveryCase endpoint uses (mirrors worker/spine signals).
    const caseEvents = eventsByCase.get(caseRow.id || caseIdByCust.get(custId) || '') || []
    const brokenByTransition = caseEvents.filter(
      (ev: any) =>
        ev.event_type === 'transition' &&
        ev.payload?.from_recovery_state === 'promised' &&
        ev.payload?.to_recovery_state === 'overdue',
    ).length
    const brokenByPromiseStatus = custPromises.filter((p: any) => p.status === 'broken').length
    const brokenPromises = Math.max(brokenByTransition, brokenByPromiseStatus)

    const lastActivity = caseRow.last_activity_at ?? caseRow.created_at
    const ignoredReminders = allWa.filter(
      (w: any) =>
        w.direction === 'outbound' &&
        ['sent', 'delivered', 'read'].includes(w.status) &&
        (!lastActivity || +new Date(w.occurred_at) > +new Date(lastActivity)),
    ).length

    const noAnswerSessions = (sessionsByCust.get(custId) || []).filter(
      (s: any) => s.outcome === 'no_answer',
    ).length
    const callActions = custActions.filter((a: any) =>
      ['call', 'follow_up_call', 'visit'].includes(a.action_type ?? ''),
    )
    const unansweredCalls = Math.max(
      noAnswerSessions,
      callActions.filter((a: any) => a.status !== 'cancelled').length,
    )

    const activeArrangement = custPromises.some(
      (p: any) => p.status === 'active' && +new Date(p.promiseDate) > +new Date(),
    )

    const escalationDecisionResult = escalationDecision({
      overdueDays: maxOverdueDays,
      outstanding,
      invoiceCount: custInvoices.length,
      brokenPromises,
      ignoredReminders,
      unansweredCalls,
      hasActiveArrangement: activeArrangement,
    })

    const sec = sectionFor(decision.state)

    cards.push({
      caseId: caseRow.id ?? null,
      customerId: custId,
      customerName: cust.customer_name || 'Customer',
      phone: cust.phone || null,
      outstanding,
      invoiceCount: custInvoices.length,
      maxOverdueDays,
      section: sec,
      state: decision.state,
      headline: decision.headline,
      reason: decision.reason,
      targetInvoiceId: decision.targetInvoiceId,
      evidence: {
        lastDelivery,
        replied: !!latestInbound,
        replyPreview: latestInbound?.message_preview ?? null,
        promiseDate: activePromise?.promise_date ?? null,
      },
      automation: computeAutomationState({
        custInvoices,
        custActions,
        activePromiseDate: activePromise?.promise_date ?? null,
        latestInbound,
        outstanding,
        now,
      }),
      escalationRecommended: escalationDecisionResult.recommended,
      cta: buildCTA(decision, cust.phone || null, custId),
    })
  }

  // Sort within each section: most overdue first, then highest amount
  const sortCards = (a: RecoveryCard, b: RecoveryCard) => {
    if (b.maxOverdueDays !== a.maxOverdueDays) return b.maxOverdueDays - a.maxOverdueDays
    return b.outstanding - a.outstanding
  }

  const needsYou = cards.filter(c => c.section === 'needs_you').sort(sortCards)
  const billzoIsHandling = cards.filter(c => c.section === 'automated').sort(sortCards)
  const monitoring = cards.filter(c => c.section === 'monitoring').sort(sortCards)
  const exhausted = cards.filter(c => c.section === 'exhausted').sort(sortCards)

  // Total outstanding must match Home/Invoices — sum of ALL open invoices, not just those with recovery_cases.
  // Previous cards-only sum under-counted when cases missing or >100 limit.
  const focusOutstanding = cards.reduce((s, c) => s + c.outstanding, 0)
  let totalOutstanding = focusOutstanding
  try {
    const { data: allTenantInvoices } = await supabaseAdmin
      .from('invoices')
      .select('grand_total, total, paid_amount, outstanding_amount, status')
      .eq('tenant_id', tenantId)
      .limit(1000)
    let sumAll = 0
    for (const inv of allTenantInvoices || []) {
      if ((inv.status as string) !== 'paid' && (inv.status as string) !== 'cancelled') {
        sumAll += invoiceOutstanding(inv)
      }
    }
    totalOutstanding = Math.max(sumAll, focusOutstanding)
  } catch {
    totalOutstanding = focusOutstanding
  }

  // Authoritative recoveredThisMonth from payments ledger (not attributions/outcomes) — month = Asia/Kolkata.
  const monthStart = monthStartIST(now)
  let recoveredThisMonth = 0
  try {
    const { data: monthPayments } = await supabaseAdmin
      .from('payments')
      .select('amount')
      .eq('tenant_id', tenantId)
      .eq('status', 'paid')
      .gte('created_at', monthStart)
    recoveredThisMonth = (monthPayments || []).reduce((s: number, p: any) => s + (parseFloat(p.amount) || 0), 0)
  } catch {
    recoveredThisMonth = 0
  }

  // ── Recent Recovery — presentation-only grouped timeline (no new authority) ──
  // Separate tenant-scoped queries: payments(paid) is authoritative money, collection_actions is action evidence,
  // whatsapp_events delivery is transport evidence. No giant join — normalized in TS and sorted.
  let recentPaid: any[] = []
  try {
    const { data: recentPaidRaw } = await supabaseAdmin
      .from('payments')
      .select('id, amount, created_at, paid_at, customer_id, invoice_id')
      .eq('tenant_id', tenantId)
      .eq('status', 'paid')
      .order('created_at', { ascending: false })
      .limit(5)
    recentPaid = recentPaidRaw || []
  } catch {
    recentPaid = []
  }
  const invById = new Map((invoices || []).map((i: any) => [i.id, i]))

  const recentRecovery: RecentRecoveryItem[] = []

  for (const p of recentPaid) {
    const cust = custMap.get(p.customer_id)
    const inv = p.invoice_id ? invById.get(p.invoice_id) : null
    const amt = parseFloat(p.amount) || 0
    const at = p.paid_at || p.created_at
    recentRecovery.push({
      id: `pay-${p.id}`,
      kind: 'payment',
      customerId: p.customer_id,
      customerName: cust?.customer_name || 'Customer',
      amount: amt,
      invoiceNumber: inv?.invoice_number || null,
      title: `₹${amt.toLocaleString('en-IN')} received`,
      detail: `${cust?.customer_name || 'Customer'}${inv?.invoice_number ? ` · ${inv.invoice_number}` : ''} — Payment received · Recovered`,
      occurredAt: at,
      status: 'paid',
    })
  }

  // Recent reminder evidence — from already-fetched actions + delivery map (no extra join)
  const sortedActions = [...(actions || [])]
    .filter((a: any) => ['send_reminder', 'whatsapp', 'reminder', 'whatsapp_reminder'].some((k) => (a.action_type || '').includes(k)) || a.action_type === 'send_reminder')
    .sort((a: any, b: any) => +new Date(b.completed_at || b.scheduled_at || 0) - +new Date(a.completed_at || a.scheduled_at || 0))
    .slice(0, 5)

  for (const a of sortedActions) {
    const cust = custMap.get(a.customer_id)
    const rows = waByAction.get(a.id) || []
    const d = {
      readAt: rows.filter((r: any) => r.read_at).map((r: any) => r.read_at).pop(),
      deliveredAt: rows.filter((r: any) => r.delivered_at).map((r: any) => r.delivered_at).pop(),
      sentAt: rows.filter((r: any) => r.status === 'sent').map((r: any) => r.occurred_at).pop(),
      failedAt: rows.filter((r: any) => r.status === 'failed').map((r: any) => r.occurred_at).pop(),
    }
    const status: RecentRecoveryItem['status'] = d.readAt ? 'read' : d.deliveredAt ? 'delivered' : d.sentAt ? 'sent' : d.failedAt ? 'failed' : 'waiting'
    const title =
      status === 'delivered' ? 'Reminder delivered' :
      status === 'read' ? 'Reminder read' :
      status === 'failed' ? 'Reminder failed' :
      status === 'sent' ? 'Reminder sent' : 'Reminder queued'
    const at = d.readAt || d.deliveredAt || d.sentAt || d.failedAt || a.completed_at || a.scheduled_at
    if (!at) continue
    const custOutstanding = invByCust.get(a.customer_id || '')?.reduce((s: number, i: any) => s + invoiceOutstanding(i), 0) ?? null
    recentRecovery.push({
      id: `rem-${a.id}`,
      kind: 'reminder',
      customerId: a.customer_id,
      customerName: cust?.customer_name || 'Customer',
      amount: custOutstanding,
      invoiceNumber: null,
      title,
      detail: `${cust?.customer_name || 'Customer'}${custOutstanding != null ? ` · ${new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(custOutstanding)} outstanding` : ''} — WhatsApp ${status}${status === 'delivered' ? ' · Awaiting response' : status === 'failed' ? '' : ' · Waiting for customer'}`,
      occurredAt: at,
      status,
    })
  }

  recentRecovery.sort((a, b) => +new Date(b.occurredAt) - +new Date(a.occurredAt))
  const trimmedRecent = recentRecovery.slice(0, 8)

  return {
    summary: {
      totalCases: cards.length,
      needsYou: needsYou.length,
      automated: billzoIsHandling.length,
      monitoring: monitoring.length,
      exhausted: exhausted.length,
      totalOutstanding,
      escalationRecommended: cards.filter((c) => c.escalationRecommended).length,
      recoveredThisMonth,
    },
    automation: {
      scheduledActions: cards.reduce((s, c) => s + c.automation.scheduledActions.length, 0),
      awaitingEvaluation: cards.filter((c) => c.automation.evaluationOverdue).length,
      pausedByReply: cards.filter((c) => c.automation.stopCondition.kind === 'replied').length,
      pausedByPromise: cards.filter((c) => c.automation.stopCondition.kind === 'promise').length,
    },
    needsYou,
    billzoIsHandling,
    monitoring,
    exhausted,
    recentRecovery: trimmedRecent,
    generatedAt: now.toISOString(),
  }
}