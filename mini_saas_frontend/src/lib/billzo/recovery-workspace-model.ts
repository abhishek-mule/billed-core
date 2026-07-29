import { supabaseAdmin } from '@/lib/billzo/supabase-admin'

/* ─── Types ─────────────────────────────────────────────────────────── */

export type ActionItem = {
  caseId: string
  customerId: string
  customerName: string
  phone: string | null
  amount: number
  recoverableAmount: number
  overdue: number
  actionType: string
  state: string
  reasons: { type: string; impact: 'high' | 'medium' | 'low' }[]
}

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

export type RecoveryWorkspaceModel = {
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

const estimateRecoverable = (outstanding: number, c: any, cust: any) => {
  let confidence = 0.65
  const tier = (cust.customer_tier || 'standard').toLowerCase()
  if (tier === 'vip') confidence += 0.20
  else if (tier === 'regular') confidence += 0.05
  else if (tier === 'risky') confidence -= 0.20
  confidence -= (c.broken_promises || 0) * 0.15
  confidence -= Math.min((c.reminder_count || 0) * 0.08, 0.40)
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
  const r: { type: string; impact: 'high' | 'medium' | 'low' }[] = []
  if (c.broken_promises > 0) r.push({ type: 'promise_broken', impact: 'high' })
  if (c.reminder_count > 0) r.push({ type: `${c.reminder_count}_reminders_ignored`, impact: 'medium' })
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

/* ─── Core Fetch ────────────────────────────────────────────────────── */

async function fetchRawData(tenantId: string) {
  const now = new Date()
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString()

  // Active cases
  let { data: cases } = await supabaseAdmin
    .from('recovery_cases')
    .select('id, customer_id, total_outstanding, total_overdue, recovery_state_v2, promise_to_pay_date, next_action_type, broken_promises, reminder_count')
    .eq('tenant_id', tenantId)
    .gt('total_outstanding', 0)
    .in('recovery_state_v2', ['active', 'overdue', 'partial_payment', 'promised', 'disputed'])
    .order('total_overdue', { ascending: false })
    .limit(50)

  const nullCustCases = (cases || []).filter((c: any) => !c.customer_id)
  for (const nc of nullCustCases) {
    const walkinId = await ensureWalkinCustomer(tenantId)
    await supabaseAdmin.from('recovery_cases').update({ customer_id: walkinId }).eq('id', nc.id)
    nc.customer_id = walkinId
  }

  const customerIds = [...new Set((cases || []).map((c: any) => c.customer_id))]

  const { data: invoices } = customerIds.length
    ? await supabaseAdmin
        .from('invoices')
        .select('customer_id, total, grand_total, paid_amount, outstanding_amount, status, due_date')
        .eq('tenant_id', tenantId)
        .in('customer_id', customerIds)
        .gt('outstanding_amount', 0)
    : { data: [] as any[] }

  const { data: customers } = customerIds.length
    ? await supabaseAdmin
        .from('customers')
        .select('id, customer_name, phone, customer_tier')
        .in('id', customerIds)
    : { data: [] as any[] }

  // Scheduled today
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

  // Recovered (last 7 days)
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

  return { now, cases: cases || [], invoices: invoices || [], customers: customers || [], scheduled: scheduled || [], schedCustomers: schedCustomers || [], recovered: recovered || [], startOfDay, endOfDay }
}

/* ─── Projections ───────────────────────────────────────────────────── */

export async function getRecoveryWorkspaceModel(tenantId: string): Promise<RecoveryWorkspaceModel> {
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
      ? Math.max(...overdueInvs.map((i: any) => Math.floor((now.getTime() - new Date(i.due_date).getTime()) / 86400000)))
      : 0
    return { out, ovd }
  }

  // Build action items
  const allItems: ActionItem[] = (cases || [])
    .map((c: any) => {
      const cust = custMap.get(c.customer_id) || {}
      const { out, ovd } = invoiceAmounts(c.customer_id)
      const { recoverableAmount } = estimateRecoverable(out, c, cust)
      return {
        caseId: c.id,
        customerId: c.customer_id,
        customerName: cust.customer_name || 'Customer',
        phone: cust.phone || null,
        amount: out,
        recoverableAmount,
        overdue: ovd,
        actionType: c.next_action_type || 'send_reminder',
        state: c.recovery_state_v2 || 'active',
        reasons: buildReasons(c),
      }
    })
    .filter((c: any) => c.amount > 0)

  // Sort: call first, then by recoverable amount desc
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

  // Upcoming
  const upcoming: ScheduledItem[] = (scheduled || []).map((a: any) => ({
    id: a.id,
    actionType: a.action_type,
    customerName: (schedCustMap.get(a.customer_id) || {}).customer_name || 'Customer',
    scheduledAt: a.scheduled_at,
  }))

  // Hero
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

  // Recovery Health
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
  hero: RecoveryWorkspaceModel['hero']
  todayPlan: RecoveryWorkspaceModel['todayPlan']
  attention: RecoveryWorkspaceModel['attention']
  upcoming: RecoveryWorkspaceModel['upcoming']
  health: RecoveryWorkspaceModel['health']
}

export async function getDashboardProjection(tenantId: string): Promise<DashboardProjection> {
  const model = await getRecoveryWorkspaceModel(tenantId)
  return {
    hero: model.hero,
    todayPlan: model.todayPlan,
    attention: model.attention,
    upcoming: model.upcoming,
    health: model.health,
  }
}
