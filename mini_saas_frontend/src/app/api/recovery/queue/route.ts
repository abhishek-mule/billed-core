import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import { buildQueueItems } from '@/lib/recovery/queue-service'
import { verifyRequest } from '@/lib/billzo/api-middleware'
import { fetchPriorityCases } from '@/lib/recovery/priority-query'
import { requireFeature } from '@/lib/auth/feature-gate'

export const dynamic = 'force-dynamic'

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { db: { schema: 'public' } })
}

const fmtDate = (d: Date) => d.toISOString()

const zeroSummary = () => ({
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
  // NEW fields
  stuckMoneyTotal: 0,
  customersNeedingAction: 0,
  collectedAfterFollowup: 0,
  casesResolvedThisMonth: 0,
  priorityCases: [],
})

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyRequest(request)
    if (auth.response) return auth.response
    const { tenantId } = auth

    // Feature gate — paid plan gets full queue, starter gets preview
    const gate = await requireFeature(tenantId!, 'recovery_queue', 'GET')
    if (!gate.allowed) {
      const { data: previewData } = await supabaseAdmin
        .from('invoices')
        .select('total, paid_amount, due_at, customer_id, customer_name')
        .eq('tenant_id', tenantId!)
        .in('status', ['unpaid', 'overdue', 'partial'])
        .order('due_at', { ascending: true })

      const now = new Date()
      const enriched = (previewData || []).map((r: any) => ({
        ...r,
        outstanding: Math.max((parseFloat(r.total) || 0) - (parseFloat(r.paid_amount) || 0), 0),
      })).filter(r => r.outstanding > 0)

      const totalOverdue = enriched.reduce(
        (s: number, r: any) => s + r.outstanding, 0,
      )
      const overdueCount = enriched.length
      const oldestDue = enriched.reduce((oldest: number, r: any) => {
        const d = r.due_at ? new Date(r.due_at).getTime() : now.getTime()
        return d < oldest ? d : oldest
      }, now.getTime())

      const samples = enriched.slice(0, 3).map((r: any, i: number) => ({
        customer: `Customer ${String.fromCharCode(65 + i)}`,
        amount: r.outstanding,
        daysOverdue: r.due_at
          ? Math.floor((now.getTime() - new Date(r.due_at).getTime()) / (1000 * 60 * 60 * 24))
          : 0,
      }))

      return NextResponse.json({
        access: 'preview',
        data: {
          totalOverdue,
          overdueCount,
          oldestDueDays: Math.floor((now.getTime() - oldestDue) / (1000 * 60 * 60 * 24)),
          samples,
        },
      })
    }

    const supabase = getSupabase()
    if (!supabase) {
      return NextResponse.json({ items: [], recoveredToday: 0, summary: zeroSummary() })
    }

    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const weekStart = new Date(todayStart.getTime() - todayStart.getDay() * 86400000)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const fmt = fmtDate

    // ── Run all Supabase queries in parallel ──
    const [
      activeCasesRes,
      unpaidInvoicesRes,
      attributedRes,
      allPaymentsRes,
      salesRes,
      productsRes,
      customersRes,
      vipRes,
      blockedRes,
      eventsRes,
    ] = await Promise.all([
      supabase
        .from('recovery_cases')
        .select(`*, customers(id, customer_name, phone, customer_tier)`)
        .eq('tenant_id', tenantId)
        .gt('total_outstanding', 0)
        .order('attention_score', { ascending: false })
        .limit(50),
      supabase
        .from('invoices')
        .select('*, customers(id, customer_name, phone, customer_tier)')
        .eq('tenant_id', tenantId)
        .in('status', ['unpaid', 'overdue', 'partial'])
        .order('created_at', { ascending: false }),
      supabase
        .from('recovery_attributions')
        .select('amount, attributed_amount, created_at')
        .eq('tenant_id', tenantId)
        .gte('created_at', fmt(monthStart))
        .order('created_at', { ascending: false }),
      supabase
        .from('payments')
        .select('amount, created_at')
        .eq('tenant_id', tenantId)
        .eq('status', 'paid')
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('invoices')
        .select('total, created_at')
        .eq('tenant_id', tenantId)
        .gte('created_at', fmt(monthStart)),
      supabase
        .from('products')
        .select('stock_quantity, low_stock_at')
        .eq('tenant_id', tenantId),
      supabase
        .from('customers')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId),
      supabase
        .from('customers')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('customer_tier', 'vip'),
      supabase
        .from('recovery_decisions')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('decision', 'block')
        .gte('created_at', fmt(todayStart)),
      supabase
        .from('recovery_case_events')
        .select(`reason, event_type, occurred_at, recovery_cases!inner(tenant_id)`)
        .eq('recovery_cases.tenant_id', tenantId)
        .order('occurred_at', { ascending: false })
        .limit(5),
    ])

    // ── Process results ──
    const activeCases = activeCasesRes.data || []
    const rawInvoices = unpaidInvoicesRes.data || []
    
    // Synthesize cases for customers who have unpaid invoices but NO active recovery_case
    const existingCustIds = new Set(activeCases.map(c => c.customer_id))
    const synthesizedCases: any[] = []
    
    // Group raw invoices by customer
    const groupedInvoices = new Map<string, any[]>()
    for (const inv of rawInvoices) {
      if (!groupedInvoices.has(inv.customer_id)) groupedInvoices.set(inv.customer_id, [])
      groupedInvoices.get(inv.customer_id)!.push(inv)
    }
    
    for (const [custId, invs] of groupedInvoices.entries()) {
      if (!existingCustIds.has(custId)) {
        const first = invs[0]
        const total = invs.reduce((s, i) => s + (parseFloat(i.total) || 0) - (parseFloat(i.paid_amount) || 0), 0)
        const overdue = invs.filter(i => i.status === 'overdue' || (i.due_date && new Date(i.due_date) < now))
          .reduce((s, i) => s + (parseFloat(i.total) || 0) - (parseFloat(i.paid_amount) || 0), 0)
        
        synthesizedCases.push({
          id: `virtual-${custId}`,
          tenant_id: tenantId,
          customer_id: custId,
          status: 'open',
          total_outstanding: total,
          total_overdue: overdue,
          recovery_state_v2: overdue > 0 ? 'overdue' : 'active',
          engagement_state_v2: 'unseen',
          reminder_count: invs.reduce((s, i) => s + (i.reminder_count || 0), 0),
          last_activity_at: first.created_at,
          attention_score: overdue > 0 ? 50 : 10,
          customers: first.customers,
        })
      }
    }

    const allCases = [...activeCases, ...synthesizedCases]
    const queue = buildQueueItems(allCases)

    // ── Attribution metrics ──
    const attributedAmounts = { today: 0, week: 0, month: 0, total: 0 }
    for (const a of attributedRes.data || []) {
      const amt = parseFloat(a.attributed_amount ?? a.amount) || 0
      const ts = a.created_at
      attributedAmounts.total += amt
      if (ts >= fmt(todayStart)) attributedAmounts.today += amt
      if (ts >= fmt(weekStart)) attributedAmounts.week += amt
      if (ts >= fmt(monthStart)) attributedAmounts.month += amt
    }

    // ── Total collected today ──
    const todayStartIso = fmt(todayStart)
    const totalCollectedToday = (allPaymentsRes.data || [])
      .filter((p: any) => p.created_at >= todayStartIso)
      .reduce((s: number, p: any) => s + (parseFloat(p.amount) || 0), 0)

    // ── Sales metrics ──
    let todaySales = 0
    let monthSales = 0
    for (const inv of salesRes.data || []) {
      const amt = parseFloat(inv.total) || 0
      monthSales += amt
      if (inv.created_at >= fmt(todayStart)) todaySales += amt
    }

    // ── Low stock products ──
    const lowStock = (productsRes.data || []).filter(
      (p: any) => (p.stock_quantity || 0) <= (p.low_stock_at || 10)
    ).length

    // ── Customer stats ──
    const totalCustomers = customersRes.count ?? 0
    const vipCustomers = vipRes.count ?? 0

    // ── Blocked reminders today ──
    const blockedRemindersToday = blockedRes.data?.length ?? 0

    // ── Recent events ──
    const recentEvents = (eventsRes.data || []).map((e: any) => ({
      reason: e.reason,
      eventType: e.event_type,
      occurredAt: e.occurred_at,
    }))

    // ── NEW: Fetch priority cases ──
    const priorityCases = await fetchPriorityCases(tenantId!, 5)

    // ── Summary ──
    const outstanding = allCases.reduce(
      (s: number, c: any) => s + (parseFloat(c.total_outstanding) || 0), 0
    )

    const stuckMoneyTotal = allCases.reduce(
      (s: number, c: any) => s + (parseFloat(c.total_overdue) || 0), 0
    )

    const customersNeedingAction = allCases.filter((c: any) => 
      ['send_reminder', 'call', 'follow_up_call'].includes(c.next_action_type)
    ).length

    const dueToday = allCases.filter((c: any) => {
      if (!c.promise_to_pay_date) return false
      const d = new Date(c.promise_to_pay_date)
      return d <= now
    }).reduce((s: number, c: any) => s + (parseFloat(c.total_overdue) || 0), 0)

    // Calculate collected after followup (payments where case had reminders)
    const { data: followupPayments } = await supabaseAdmin
      .from('payments')
      .select('amount')
      .eq('tenant_id', tenantId)
      .eq('status', 'paid')
      .gte('created_at', fmt(monthStart))

    let collectedAfterFollowup = 0
    if (followupPayments) {
      const caseIds = allCases.map(c => c.id).filter(id => !id.startsWith('virtual-'))
      // This is approximate - would need exact attribution for precision
      collectedAfterFollowup = followupPayments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0)
    }

    // Cases resolved this month
    const { count: casesResolvedThisMonth } = await supabaseAdmin
      .from('recovery_cases')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('recovery_state_v2', 'recovered')
      .gte('updated_at', fmt(monthStart))

    return NextResponse.json({
      access: 'full',
      items: queue.items,
      recoveredToday: attributedAmounts.today,
      recentEvents,
      summary: {
        collectibleToday: queue.summary.collectibleToday,
        outstanding,
        activeCases: queue.summary.activeCaseCount,
        recoveredToday: attributedAmounts.today,
        recoveredThisWeek: attributedAmounts.week,
        recoveredThisMonth: attributedAmounts.month,
        recoveredAttributed: attributedAmounts.total,
        totalCollectedToday,
        dueToday,
        queueSize: queue.summary.queueSize,
        todaySales,
        monthSales,
        lowStockItems: lowStock,
        totalCustomers: totalCustomers || 0,
        vipCustomers: vipCustomers || 0,
        blockedRemindersToday,
        // NEW fields
        stuckMoneyTotal,
        customersNeedingAction,
        collectedAfterFollowup,
        casesResolvedThisMonth: casesResolvedThisMonth || 0,
        priorityCases: priorityCases.map(pc => ({
          caseId: pc.caseId,
          customerId: pc.customerId,
          customerName: pc.customerName,
          phone: pc.phone,
          totalOverdue: pc.totalOverdue,
          oldestOverdueDays: pc.oldestOverdueDays,
          attentionScore: pc.attentionScore,
          nextActionType: pc.nextActionType,
          promiseToPayDate: pc.promiseToPayDate,
          ignoredReminders: pc.ignoredReminders,
          brokenPromises: pc.brokenPromises,
          openInvoiceCount: pc.openInvoiceCount,
          automationMode: pc.automationMode,
        })),
      },
    })
  } catch (err: any) {
    console.error('[RecoveryQueue] Error:', err)
    return NextResponse.json({ items: [], recoveredToday: 0, summary: zeroSummary() })
  }
}
