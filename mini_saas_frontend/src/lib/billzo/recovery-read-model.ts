import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import { calculateDaysOverdue } from '@/lib/billzo/days-overdue'

/* ─── Types ─────────────────────────────────────────────────────────── */

export type ActionItem = {
  caseId: string
  customerId: string
  customerName: string
  phone: string | null
  invoiceNumber?: string | null
  invoiceCount: number
  amount: number
  recoverableAmount: number
  overdue: number
  actionType: string
  state: string
  reasons: { type: string; impact: 'high' | 'medium' | 'low' }[]
  // recovery-state-machine inputs (single truth for the status badge)
  promiseToPayDate: string | null
  maxDeliveryStatus: 'sent' | 'delivered' | 'read' | null
  ignoredReminders: number
  brokenPromises: number
}

/**
 * Behavioral signals shared by every projection (Home, queue, customer).
 * Computed once per case from canonical sources (invoices, recovery_case_events,
 * customers) — never from recovery_cases, which does not own this data.
 */
export type RecoverySignals = {
  ignoredReminders: number
  brokenPromises: number
  deliveryStatus: 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | null
  phoneMissing: boolean
  hasActivePromise: boolean
  paymentProbability: number
}

export const emptySignals = (): RecoverySignals => ({
  ignoredReminders: 0,
  brokenPromises: 0,
  deliveryStatus: null,
  phoneMissing: false,
  hasActivePromise: false,
  paymentProbability: 0,
})

export type AttentionItem = ActionItem & {
  invoiceCount: number
  severity: 'critical' | 'high' | 'normal'
  badges: string[]
}

export type ScheduledItem = {
  id: string
  actionType: string
  customerName: string
  scheduledAt: string
  amount?: string
}

export type HealthDriver = {
  title: string
  status: 'good' | 'warning' | 'critical'
  impact: 'high' | 'medium' | 'low'
}

export type RecoveryReadModel = {
  hero: {
    outstanding: number
    customerCount: number
    invoiceCount: number
    bestOpportunity: {
      customerId: string
      caseId: string
      customerName: string
      amount: number
      actionType: string
      phone: string | null
    } | null
  }
  todayPlan: ActionItem[]
  attention: AttentionItem[]
  upcoming: ScheduledItem[]
  health: {
    score: number
    drivers: HealthDriver[]
  }
  generatedAt: string
}

/* ─── Helpers ───────────────────────────────────────────────────────── */

const invoiceOutstanding = (i: any) =>
  Number(i.outstanding_amount) > 0
    ? Number(i.outstanding_amount)
    : Math.max(0, (Number(i.grand_total || i.total || 0)) - (Number(i.paid_amount) || 0))

export const estimateRecoverable = (outstanding: number, c: any, cust: any) => {
  const signals: RecoverySignals = c?.signals || emptySignals()
  let confidence = 0.65
  const tier = (cust.customer_tier || 'standard').toLowerCase()
  if (tier === 'vip') confidence += 0.20
  else if (tier === 'regular') confidence += 0.05
  else if (tier === 'risky') confidence -= 0.20
  confidence -= signals.brokenPromises * 0.15
  confidence -= Math.min(signals.ignoredReminders * 0.08, 0.40)
  const state = c.recovery_state_v2 || 'active'
  if (state === 'promised' || state === 'partial_payment') confidence += 0.10
  else if (state === 'disputed') confidence -= 0.40
  confidence = Math.max(0.05, Math.min(0.95, confidence))
  return {
    recoverableAmount: Math.round(outstanding * confidence),
    recoveryConfidence: Math.round(confidence * 100),
  }
}

function buildReasons(c: any): { type: string; impact: 'high' | 'medium' | 'low' }[] {
  const signals: RecoverySignals = c?.signals || emptySignals()
  const r: { type: string; impact: 'high' | 'medium' | 'low' }[] = []
  if (signals.brokenPromises > 0) r.push({ type: 'promise_broken', impact: 'high' })
  if (signals.ignoredReminders > 0) r.push({ type: `${signals.ignoredReminders}_reminders_ignored`, impact: 'medium' })
  return r
}

/* ─── Self-healing ──────────────────────────────────────────────────── */

export async function ensureWalkinCustomer(tenantId: string): Promise<string> {
  const walkinId = 'cust_walkin_' + tenantId
  const { data: existing } = await supabaseAdmin.from('customers').select('id').eq('id', walkinId).maybeSingle()
  if (existing) return walkinId
  await supabaseAdmin.from('customers').insert({
    id: walkinId,
    tenant_id: tenantId,
    customer_name: 'Walk-in Customer',
    phone: null,
    customer_tier: 'regular',
    is_active: true,
    automation_mode: 'full_auto',
    phone_verification: 'unknown',
    reputation_score: 50,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })
  await supabaseAdmin
    .from('invoices')
    .update({ customer_id: walkinId })
    .eq('tenant_id', tenantId)
    .is('customer_id', null)
    .gt('outstanding_amount', 0)
  return walkinId
}

/* ─── Self-healing: backfill recovery_cases from invoices ─────────── */

async function backfillCases(tenantId: string): Promise<void> {
  try {
    const walkinId = await ensureWalkinCustomer(tenantId)
    console.log('[backfillCases] walkinId:', walkinId)

    const { data: invoices, error: invErr } = await supabaseAdmin
      .from('invoices')
      .select('customer_id, outstanding_amount, grand_total, total, paid_amount')
      .eq('tenant_id', tenantId)
      .gt('outstanding_amount', 0)
    if (invErr) { console.error('[backfillCases] invoice query error:', invErr.message); return }
    if (!invoices || invoices.length === 0) { console.log('[backfillCases] no invoices found'); return }
    console.log('[backfillCases] found', invoices.length, 'invoices')

    const byCust = new Map<string, { outstanding: number; invCount: number }>()
  for (const inv of invoices) {
      const cid = inv.customer_id
      if (!cid) { console.log('[backfillCases] skipping invoice with null customer_id'); continue }
      if (!byCust.has(cid)) byCust.set(cid, { outstanding: 0, invCount: 0 })
      const entry = byCust.get(cid)!
      entry.outstanding += Number(inv.outstanding_amount)
      entry.invCount++
    }
    console.log('[backfillCases] grouped into', byCust.size, 'customers')

    const { data: existing, error: existErr } = await supabaseAdmin
      .from('recovery_cases')
      .select('customer_id')
      .eq('tenant_id', tenantId)
    if (existErr) { console.error('[backfillCases] existing query error:', existErr.message); return }

    const existingCust = new Set((existing || []).map((c: any) => c.customer_id))
    let created = 0
    for (const [custId, info] of byCust) {
      if (existingCust.has(custId)) { console.log('[backfillCases] already has case for', custId); continue }
      const { error: insertErr } = await supabaseAdmin.from('recovery_cases').insert({
        tenant_id: tenantId,
        customer_id: custId,
        status: 'open',
        total_outstanding: info.outstanding,
        invoice_count: info.invCount,
        recovery_state_v2: 'active',
        engagement_state_v2: 'unseen',
        next_action_type: 'send_reminder',
        open_invoice_count: info.invCount,
        overdue_invoice_count: 0,
        total_overdue: 0,
        attention_score: Math.min(Math.round(info.outstanding / 100), 100),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      if (insertErr) { console.error('[backfillCases] insert error for', custId, ':', insertErr.message) }
      else { created++ }
    }
    console.log('[backfillCases] created', created, 'new cases')
  } catch (err: any) {
    console.error('[backfillCases] unexpected error:', err.message)
  }
}

/* ─── Core Fetch ────────────────────────────────────────────────────── */

async function fetchRawData(tenantId: string) {
  const now = new Date()
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString()

  let { data: cases, error: casesErr } = await supabaseAdmin
    .from('recovery_cases')
      .select('id, customer_id, total_outstanding, total_overdue, recovery_state_v2, promise_to_pay_date, next_action_type, engagement_state_v2')
    .eq('tenant_id', tenantId)
    .gt('total_outstanding', 0)
    .in('recovery_state_v2', ['active', 'overdue', 'partial_payment', 'promised', 'disputed'])
    .order('total_overdue', { ascending: false })
    .limit(50)

  if (casesErr) console.error('[fetchRawData] cases error:', casesErr.message)

  if (!cases || cases.length === 0) {
    console.log('[fetchRawData] no cases found — running backfill')
    await backfillCases(tenantId)
    const { data: refetched, error: refetchErr } = await supabaseAdmin
      .from('recovery_cases')
    .select('id, customer_id, total_outstanding, total_overdue, recovery_state_v2, promise_to_pay_date, next_action_type, engagement_state_v2')
      .eq('tenant_id', tenantId)
      .gt('total_outstanding', 0)
      .in('recovery_state_v2', ['active', 'overdue', 'partial_payment', 'promised', 'disputed'])
      .order('total_overdue', { ascending: false })
      .limit(50)
    if (refetchErr) console.error('[fetchRawData] refetch error:', refetchErr.message)
    cases = refetched || []
    console.log('[fetchRawData] after backfill — cases count:', cases.length)
  }

  const nullCustCases = (cases || []).filter((c: any) => !c.customer_id)
  for (const nc of nullCustCases) {
    const walkinId = await ensureWalkinCustomer(tenantId)
    await supabaseAdmin.from('recovery_cases').update({ customer_id: walkinId }).eq('id', nc.id)
    nc.customer_id = walkinId
  }

  const customerIds = [...new Set((cases || []).map((c: any) => c.customer_id))]

  const { data: invoices, error: invErr } = customerIds.length
    ? await supabaseAdmin
        .from('invoices')
        .select('customer_id, invoice_number, total, grand_total, paid_amount, outstanding_amount, status, due_date, reminder_count')
        .eq('tenant_id', tenantId)
        .in('customer_id', customerIds)
        .gt('outstanding_amount', 0)
    : { data: [] as any[] }
  if (invErr) console.error('[fetchRawData] invoices error:', invErr.message, 'customerIds:', customerIds)

  const { data: customers, error: custErr } = customerIds.length
    ? await supabaseAdmin
        .from('customers')
        .select('id, customer_name, phone, customer_tier, last_whatsapp_status')
        .in('id', customerIds)
    : { data: [] as any[] }
  if (custErr) console.error('[fetchRawData] customers error:', custErr.message)

  const { data: scheduled } = await supabaseAdmin
    .from('collection_actions')
    .select('id, customer_id, action_type, channel, template_name, scheduled_at, invoice_ids')
    .eq('tenant_id', tenantId)
    .eq('status', 'scheduled')
    .gte('scheduled_at', startOfDay)
    .lt('scheduled_at', endOfDay)
    .order('scheduled_at', { ascending: true })
    .limit(50)

  const schedCustomerIds = [...new Set((scheduled || []).map((a: any) => a.customer_id).filter(Boolean))]
  const { data: schedCustomers } = schedCustomerIds.length
    ? await supabaseAdmin.from('customers').select('id, customer_name').in('id', schedCustomerIds)
    : { data: [] as any[] }

  let { data: recovered } = await supabaseAdmin
    .from('recovery_cases')
    .select('id, customer_id, total_outstanding, recovery_state_v2, updated_at')
    .eq('tenant_id', tenantId)
    .in('recovery_state_v2', ['recovered', 'closed'])
    .gte('updated_at', new Date(now.getTime() - 7 * 86400000).toISOString())
    .order('updated_at', { ascending: false })
    .limit(20)

  const nullRecCases = (recovered || []).filter((c: any) => !c.customer_id)
  for (const nc of nullRecCases) {
    const walkinId = await ensureWalkinCustomer(tenantId)
    await supabaseAdmin.from('recovery_cases').update({ customer_id: walkinId }).eq('id', nc.id)
    nc.customer_id = walkinId
  }

  const recCustomerIds = [...new Set((recovered || []).map((c: any) => c.customer_id))]
  const { data: recCustomers } = recCustomerIds.length
    ? await supabaseAdmin.from('customers').select('id, customer_name').in('id', recCustomerIds)
    : { data: [] as any[] }

  // Broken promises = history (promised → overdue transitions), owned by the
  // decision log, never by recovery_cases. Same filter as get_priority_cases.
  const { data: brokenEvents } = customerIds.length
    ? await supabaseAdmin
        .from('recovery_case_events')
        .select('case_id')
        .eq('event_type', 'transition')
        .eq('payload->>from_recovery_state', 'promised')
        .eq('payload->>to_recovery_state', 'overdue')
    : { data: [] as any[] }

  const brokenByCase = new Map<string, number>()
  for (const e of brokenEvents || []) {
    brokenByCase.set(e.case_id, (brokenByCase.get(e.case_id) || 0) + 1)
  }

  // ── Compute each case's behavioral signals once, from canonical sources ──
  const custMap = new Map((customers || []).map((c: any) => [c.id, c]))
  const invByCust = new Map<string, any[]>()
  for (const inv of invoices || []) {
    const arr = invByCust.get(inv.customer_id) || []
    arr.push(inv)
    invByCust.set(inv.customer_id, arr)
  }

  const signalsByCase = new Map<string, RecoverySignals>()
  for (const c of cases) {
    const cust = custMap.get(c.customer_id) || {}
    const custInvs = invByCust.get(c.customer_id) || []
    const ignoredReminders = custInvs.reduce((s: number, i: any) => s + (Number(i.reminder_count) || 0), 0)
    const phoneMissing = !cust.phone
    const rawDelivery = cust.last_whatsapp_status || null
    const deliveryStatus: RecoverySignals['deliveryStatus'] =
      rawDelivery === 'queued' || rawDelivery === 'sent' || rawDelivery === 'delivered' || rawDelivery === 'read' || rawDelivery === 'failed'
        ? rawDelivery
        : null
    const hasActivePromise = !!(c.promise_to_pay_date && new Date(c.promise_to_pay_date) >= now)
    const signals: RecoverySignals = {
      ignoredReminders,
      brokenPromises: brokenByCase.get(c.id) || 0,
      deliveryStatus,
      phoneMissing,
      hasActivePromise,
      paymentProbability: 0,
    }
    signalsByCase.set(c.id, signals)
    ;(c as any).signals = signals
  }

  return { now, cases: cases || [], invoices: invoices || [], customers: customers || [], scheduled: scheduled || [], schedCustomers: schedCustomers || [], recovered: recovered || [], recCustomers: recCustomers || [], brokenByCase, signalsByCase, startOfDay, endOfDay }
}

/* ─── Full Read Model ───────────────────────────────────────────────── */

export async function getRecoveryReadModel(tenantId: string): Promise<RecoveryReadModel> {
  const raw = await fetchRawData(tenantId)
  const { now, cases, invoices, customers, scheduled, schedCustomers, recovered } = raw

  const custMap = new Map((customers || []).map((c: any) => [c.id, c]))
  const schedCustMap = new Map((schedCustomers || []).map((c: any) => [c.id, c]))

  const invByCust = new Map<string, any[]>()
  for (const inv of invoices) {
    const arr = invByCust.get(inv.customer_id) || []
    arr.push(inv)
    invByCust.set(inv.customer_id, arr)
  }

  const invoiceAmounts = (custId: string) => {
    const invs = invByCust.get(custId) || []
    const out = invs.reduce((s: number, i: any) => s + invoiceOutstanding(i), 0)
    const overdueInvs = invs.filter((i: any) => i.due_date && new Date(i.due_date) < now)
    const ovd = overdueInvs.length > 0
      ? Math.max(...overdueInvs.map((i: any) => calculateDaysOverdue(i.due_date)))
      : 0
    const firstInv = invs[0]
    return { out, ovd, invoiceNumber: firstInv?.invoice_number || null }
  }

  const allItems: ActionItem[] = (cases || [])
    .map((c: any) => {
      const cust = custMap.get(c.customer_id) || {}
      const { out, ovd, invoiceNumber } = invoiceAmounts(c.customer_id)
      const { recoverableAmount } = estimateRecoverable(out, c, cust)
      const custInvs = invByCust.get(c.customer_id) || []
      const signals: RecoverySignals = c?.signals || emptySignals()
      return {
        caseId: c.id,
        customerId: c.customer_id,
        customerName: cust.customer_name || 'Customer',
        phone: cust.phone || null,
        invoiceNumber,
        invoiceCount: custInvs.length || 1,
        amount: out,
        recoverableAmount,
        overdue: ovd,
        actionType: c.next_action_type || 'send_reminder',
        state: c.recovery_state_v2 || 'active',
        reasons: buildReasons(c),
        promiseToPayDate: c.promise_to_pay_date || null,
        maxDeliveryStatus: signals.deliveryStatus === 'read' || signals.deliveryStatus === 'delivered' || signals.deliveryStatus === 'sent'
          ? signals.deliveryStatus
          : null,
        ignoredReminders: signals.ignoredReminders,
        brokenPromises: signals.brokenPromises,
      }
    })
    .filter((c: any) => c.amount > 0)

  const actionOrder: Record<string, number> = { call: 0, record_payment: 1, send_reminder: 2, reminder: 3, wait: 4 }
  const sorted = [...allItems].sort((a, b) => {
    const ao = (actionOrder[a.actionType] ?? 5) - (actionOrder[b.actionType] ?? 5)
    if (ao !== 0) return ao
    return b.recoverableAmount - a.recoverableAmount
  })

  const todayPlan = sorted
  const attention: AttentionItem[] = sorted.map((a, i) => ({
    ...a,
    invoiceCount: invByCust.get(a.customerId)?.length || 1,
    severity: (a.overdue > 15 ? 'critical' : a.overdue > 0 ? 'high' : 'normal') as 'critical' | 'high' | 'normal',
    badges: a.overdue > 15 ? ['Overdue'] : [],
  }))

  const upcoming: ScheduledItem[] = (scheduled || []).map((a: any) => ({
    id: a.id,
    actionType: a.action_type,
    customerName: (schedCustMap.get(a.customer_id) || {}).customer_name || 'Customer',
    scheduledAt: a.scheduled_at,
  }))

  const outstanding = allItems.reduce((s, i) => s + i.amount, 0)
  const customerCount = new Set(allItems.map(i => i.customerId)).size
  const invoiceCount = invoices.length
  const bestOpportunity = todayPlan.length > 0
    ? {
        customerId: todayPlan[0].customerId,
        caseId: todayPlan[0].caseId,
        customerName: todayPlan[0].customerName,
        amount: todayPlan[0].recoverableAmount,
        actionType: todayPlan[0].actionType,
        phone: todayPlan[0].phone,
      }
    : null

  const totalCases = allItems.length
  const urgentCases = allItems.filter(i => i.overdue > 15).length
  const promiseBrokenCases = allItems.filter(i => i.reasons.some(r => r.type === 'promise_broken')).length

  let healthScore = 65
  if (urgentCases === 0) healthScore += 15
  else if (urgentCases > 2) healthScore -= 15
  if (promiseBrokenCases > 0) healthScore -= 10 * Math.min(promiseBrokenCases, 3)
  if (totalCases === 0) healthScore = 100
  healthScore = Math.max(0, Math.min(100, healthScore))

  const drivers: HealthDriver[] = [
    {
      title: `${totalCases} active case${totalCases === 1 ? '' : 's'}`,
      status: totalCases > 0 ? (urgentCases > 0 ? 'warning' : 'good') : 'good',
      impact: 'high',
    },
    {
      title: urgentCases > 0 ? `${urgentCases} urgent overdue` : 'No urgent overdue',
      status: urgentCases > 0 ? 'critical' : 'good',
      impact: 'high',
    },
    {
      title: promiseBrokenCases > 0 ? `${promiseBrokenCases} broken promise${promiseBrokenCases === 1 ? '' : 's'}` : 'Promises being kept',
      status: promiseBrokenCases > 0 ? 'warning' : 'good',
      impact: 'medium',
    },
  ]

  return {
    hero: { outstanding, customerCount, invoiceCount, bestOpportunity },
    todayPlan,
    attention,
    upcoming: upcoming.slice(0, 5),
    health: { score: healthScore, drivers },
    generatedAt: now.toISOString(),
  }
}

/* ─── Projection: Dashboard ─────────────────────────────────────────── */

export type DashboardProjection = {
  hero: RecoveryReadModel['hero']
  todayPlan: RecoveryReadModel['todayPlan']
  attention: RecoveryReadModel['attention']
  upcoming: RecoveryReadModel['upcoming']
  health: RecoveryReadModel['health']
}

export async function getDashboardProjection(tenantId: string): Promise<DashboardProjection> {
  const model = await getRecoveryReadModel(tenantId)
  return {
    hero: model.hero,
    todayPlan: model.todayPlan,
    attention: model.attention,
    upcoming: model.upcoming,
    health: model.health,
  }
}


