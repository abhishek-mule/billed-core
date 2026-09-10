import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import { getRecoveryCommandCenter } from './recovery-command-center'

/**
 * Authoritative dashboard summary projection.
 *
 * P3-C: this replaces the legacy `/api/recovery/queue` GET classifier.
 * All recovery numbers, ordering and membership come from the recovery decision
 * engine's persisted projections (command-center deck + decision tables).
 * No eligibility or classification is computed here — `attentionScore` is a
 * presentation-only sort key derived from persisted overdue days, never a gate.
 */

export type RecoverySummaryPriorityCase = {
  caseId: string
  customerId: string
  customerName: string
  phone: string
  totalOverdue: number
  oldestOverdueDays: number
  attentionScore: number
  nextActionType: string
  promiseToPayDate: string | null
  ignoredReminders: number
  brokenPromises: number
  openInvoiceCount: number
  automationMode: 'full_auto' | 'manual' | 'muted'
}

const fmtDate = (d: Date) => d.toISOString()

const zeroSummary = {
  collectibleToday: 0,
  outstanding: 0,
  activeCases: 0,
  recoveredToday: 0,
  recoveredThisWeek: 0,
  recoveredThisMonth: 0,
  recoveredAttributed: 0,
  totalCollectedToday: 0,
  dueToday: 0,
  queueSize: 0,
  todaySales: 0,
  monthSales: 0,
  lowStockItems: 0,
  totalCustomers: 0,
  vipCustomers: 0,
  blockedRemindersToday: 0,
  stuckMoneyTotal: 0,
  customersNeedingAction: 0,
  collectedAfterFollowup: 0,
  casesResolvedThisMonth: 0,
  totalActions: 0,
  completedActions: 0,
  pendingActions: 0,
  promiseSummary: { dueToday: 0, overdue: 0, upcoming: 0 },
  priorityCases: [] as RecoverySummaryPriorityCase[],
}

export async function getRecoverySummaryPreview(tenantId: string) {
  const { data: previewData } = await supabaseAdmin
    .from('invoices')
    .select('total, paid_amount, due_date, customer_id, customer_name')
    .eq('tenant_id', tenantId)
    .gt('outstanding_amount', 0)
    .order('due_date', { ascending: true })

  const now = new Date()
  const enriched = (previewData || []).map((r: any) => ({
    ...r,
    outstanding: Math.max((parseFloat(r.total) || 0) - (parseFloat(r.paid_amount) || 0), 0),
  })).filter(r => r.outstanding > 0)

  const totalOverdue = enriched.reduce((s: number, r: any) => s + r.outstanding, 0)
  const overdueCount = enriched.length
  const oldestDue = enriched.reduce((oldest: number, r: any) => {
    const d = r.due_date ? new Date(r.due_date).getTime() : now.getTime()
    return d < oldest ? d : oldest
  }, now.getTime())

  const samples = enriched.slice(0, 3).map((r: any, i: number) => ({
    customer: `Customer ${String.fromCharCode(65 + i)}`,
    amount: r.outstanding,
    daysOverdue: r.due_date
      ? Math.floor((now.getTime() - new Date(r.due_date).getTime()) / (1000 * 60 * 60 * 24))
      : 0,
  }))

  const previewPriorityCases = enriched.map((r: any) => {
    const daysOverdue = r.due_date
      ? Math.floor((now.getTime() - new Date(r.due_date).getTime()) / (1000 * 60 * 60 * 24))
      : 0
    return {
      caseId: `preview-${r.customer_id}`,
      customerId: r.customer_id,
      customerName: r.customer_name || 'Customer',
      phone: '',
      totalOverdue: r.outstanding,
      oldestOverdueDays: Math.max(0, daysOverdue),
      attentionScore: Math.min(daysOverdue * 5 + 10, 100),
      nextActionType: daysOverdue > 0 ? 'send_reminder' : 'wait',
      promiseToPayDate: null,
      ignoredReminders: 0,
      brokenPromises: 0,
      openInvoiceCount: enriched.filter((x: any) => x.customer_id === r.customer_id).length,
      automationMode: 'manual' as const,
    }
  })
  const seenCust = new Set<string>()
  const dedupedPreview = previewPriorityCases.filter((p: any) => {
    if (seenCust.has(p.customerId)) return false
    seenCust.add(p.customerId)
    return true
  })
  dedupedPreview.sort((a: any, b: any) => b.attentionScore - a.attentionScore)

  return {
    access: 'preview' as const,
    data: {
      totalOverdue,
      overdueCount,
      oldestDueDays: Math.floor((now.getTime() - oldestDue) / (1000 * 60 * 60 * 24)),
      samples,
    },
    recentEvents: [],
    summary: {
      outstanding: totalOverdue,
      activeCases: overdueCount,
      totalCollectedToday: 0,
      dueToday: 0,
      queueSize: 0,
      recoveredToday: 0,
      collectibleToday: 0,
      priorityCases: dedupedPreview,
    },
  }
}

export async function getRecoverySummary(tenantId: string) {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const weekStart = new Date(todayStart.getTime() - todayStart.getDay() * 86400000)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const fmt = fmtDate

  const deck = await getRecoveryCommandCenter(tenantId)

  const orderedCards = [...deck.needsYou, ...deck.billzoIsHandling, ...deck.monitoring]
  const customerIds = [...new Set(orderedCards.map(c => c.customerId).filter(Boolean))]

  const [
    { data: caseRows },
    { data: custRows },
    { data: attributedRes },
    { data: allPaymentsRes },
    { data: salesRes },
    { data: productsRes },
    customersRes,
    vipRes,
    { data: blockedRes },
    { data: eventsRes },
    { data: followupPayments },
    { count: casesResolvedThisMonth },
    { data: promisesRes },
    { data: recentPaymentsRes },
  ] = await Promise.all([
    customerIds.length > 0
      ? supabaseAdmin
          .from('recovery_cases')
          .select('id, customer_id, reminder_count, promise_to_pay_date, signals')
          .eq('tenant_id', tenantId)
          .in('customer_id', customerIds)
      : Promise.resolve({ data: [] }),
    customerIds.length > 0
      ? supabaseAdmin
          .from('customers')
          .select('id, automation_mode')
          .eq('tenant_id', tenantId)
          .in('id', customerIds)
      : Promise.resolve({ data: [] }),
    supabaseAdmin
      .from('recovery_attributions')
      .select('amount, attributed_amount, created_at')
      .eq('tenant_id', tenantId)
      .gte('created_at', fmt(monthStart))
      .order('created_at', { ascending: false }),
    supabaseAdmin
      .from('payments')
      .select('amount, created_at')
      .eq('tenant_id', tenantId)
      .eq('status', 'paid')
      .order('created_at', { ascending: false })
      .limit(50),
    supabaseAdmin
      .from('invoices')
      .select('total, created_at')
      .eq('tenant_id', tenantId)
      .gte('created_at', fmt(monthStart)),
    supabaseAdmin
      .from('products')
      .select('stock_quantity, low_stock_at')
      .eq('tenant_id', tenantId),
    supabaseAdmin
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId),
    supabaseAdmin
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('customer_tier', 'vip'),
    supabaseAdmin
      .from('recovery_decisions')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('decision', 'block')
      .gte('created_at', fmt(todayStart)),
    supabaseAdmin
      .from('recovery_case_events')
      .select('reason, event_type, occurred_at, recovery_cases!inner(tenant_id)')
      .eq('recovery_cases.tenant_id', tenantId)
      .order('occurred_at', { ascending: false })
      .limit(5),
    supabaseAdmin
      .from('payments')
      .select('amount')
      .eq('tenant_id', tenantId)
      .eq('status', 'paid')
      .gte('created_at', fmt(monthStart)),
    supabaseAdmin
      .from('recovery_cases')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('recovery_state_v2', 'recovered')
      .gte('updated_at', fmt(monthStart)),
    supabaseAdmin
      .from('payment_promises')
      .select('promise_date, status')
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .limit(500),
    supabaseAdmin
      .from('payments')
      .select('amount, created_at, customer_id, customers!inner(customer_name)')
      .eq('tenant_id', tenantId)
      .eq('status', 'paid')
      .gte('created_at', fmt(new Date(now.getTime() - 24 * 60 * 60 * 1000)))
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  const caseByCust = new Map((caseRows || []).map((r: any) => [r.customer_id, r]))
  const custMode = new Map((custRows || []).map((r: any) => [r.id, r.automation_mode]))

  const priorityCases: RecoverySummaryPriorityCase[] = orderedCards.map(card => {
    const row = caseByCust.get(card.customerId)
    const signals = (row?.signals || {}) as any
    const state = card.state
    return {
      caseId: row?.id ?? `case-${card.customerId}`,
      customerId: card.customerId,
      customerName: card.customerName,
      phone: card.phone || '',
      totalOverdue: card.outstanding,
      oldestOverdueDays: card.maxOverdueDays,
      attentionScore: Math.min(50 + card.maxOverdueDays, 100),
      nextActionType: state === 'call' ? 'call' : state === 'waiting' ? 'wait' : 'send_reminder',
      promiseToPayDate: card.evidence.promiseDate ?? row?.promise_to_pay_date ?? null,
      ignoredReminders: Number(row?.reminder_count ?? signals?.ignoredReminders ?? 0),
      brokenPromises: Number(signals?.brokenPromises ?? 0),
      openInvoiceCount: card.invoiceCount,
      automationMode: (custMode.get(card.customerId) as 'full_auto' | 'manual' | 'muted') ?? 'manual',
    }
  })

  const attributedAmounts = { today: 0, week: 0, month: 0, total: 0 }
  for (const a of attributedRes || []) {
    const amt = parseFloat(a.attributed_amount ?? a.amount) || 0
    const ts = a.created_at
    attributedAmounts.total += amt
    if (ts >= fmt(todayStart)) attributedAmounts.today += amt
    if (ts >= fmt(weekStart)) attributedAmounts.week += amt
    if (ts >= fmt(monthStart)) attributedAmounts.month += amt
  }

  const totalCollectedToday = (allPaymentsRes || [])
    .filter((p: any) => p.created_at >= fmt(todayStart))
    .reduce((s: number, p: any) => s + (parseFloat(p.amount) || 0), 0)

  let todaySales = 0
  let monthSales = 0
  for (const inv of salesRes || []) {
    const amt = parseFloat(inv.total) || 0
    monthSales += amt
    if (inv.created_at >= fmt(todayStart)) todaySales += amt
  }

  const lowStockItems = (productsRes || []).filter(
    (p: any) => (p.stock_quantity || 0) <= (p.low_stock_at || 10),
  ).length

  const totalCustomers = customersRes?.count ?? 0
  const vipCustomers = vipRes?.count ?? 0
  const blockedRemindersToday = blockedRes?.length ?? 0

  const recentEvents = (eventsRes || []).map((e: any) => ({
    reason: e.reason,
    eventType: e.event_type,
    occurredAt: e.occurred_at,
  }))

  const collectedAfterFollowup = (followupPayments || []).reduce(
    (s, p: any) => s + (parseFloat(p.amount) || 0), 0,
  )

  const promiseSummary = { dueToday: 0, overdue: 0, upcoming: 0 }
  for (const p of promisesRes || []) {
    if (!p.promise_date) continue
    const pd = new Date(p.promise_date)
    if (pd >= todayStart && pd < new Date(todayStart.getTime() + 86400000)) {
      promiseSummary.dueToday++
    } else if (pd < todayStart) {
      promiseSummary.overdue++
    } else {
      promiseSummary.upcoming++
    }
  }

  const dueToday = priorityCases
    .filter(c => c.promiseToPayDate && new Date(c.promiseToPayDate) <= now)
    .reduce((s, c) => s + c.totalOverdue, 0)

  const recentActivity = (recentPaymentsRes || []).map((p: any) => ({
    type: 'payment' as const,
    customerName: (p.customers as any)?.customer_name ?? 'Customer',
    amount: parseFloat(p.amount) || 0,
    at: p.created_at,
  }))

  return {
    access: 'full' as const,
    items: [],
    recoveredToday: attributedAmounts.today,
    recentEvents,
    recentActivity,
    summary: {
      collectibleToday: deck.summary.totalOutstanding,
      outstanding: deck.summary.totalOutstanding,
      activeCases: deck.summary.totalCases,
      recoveredToday: attributedAmounts.today,
      recoveredThisWeek: attributedAmounts.week,
      recoveredThisMonth: attributedAmounts.month,
      recoveredAttributed: attributedAmounts.total,
      totalCollectedToday,
      dueToday,
      queueSize: deck.summary.totalCases,
      todaySales,
      monthSales,
      lowStockItems,
      totalCustomers,
      vipCustomers,
      blockedRemindersToday,
      stuckMoneyTotal: deck.summary.totalOutstanding,
      customersNeedingAction: deck.summary.needsYou,
      collectedAfterFollowup,
      casesResolvedThisMonth: casesResolvedThisMonth || 0,
      totalActions: deck.summary.totalCases,
      completedActions: deck.summary.automated,
      pendingActions: deck.summary.needsYou,
      promiseSummary,
      priorityCases,
    },
  }
}

export { zeroSummary }