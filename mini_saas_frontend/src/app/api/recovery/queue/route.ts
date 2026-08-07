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
  totalActions: 0,
  completedActions: 0,
  pendingActions: 0,
  promiseSummary: { dueToday: 0, overdue: 0, upcoming: 0 },
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
        .select('total, paid_amount, due_date, customer_id, customer_name')
        .eq('tenant_id', tenantId!)
        .gt('outstanding_amount', 0)
        .order('due_date', { ascending: true })

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

      // Build priority cases from invoice data so Dashboard work items populate
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
      // Deduplicate by customer (take the highest overdue per customer)
      const seenCust = new Set<string>()
      const dedupedPreview = previewPriorityCases.filter((p: any) => {
        if (seenCust.has(p.customerId)) return false
        seenCust.add(p.customerId)
        return true
      })
      dedupedPreview.sort((a: any, b: any) => b.attentionScore - a.attentionScore)

      return NextResponse.json({
        access: 'preview',
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
      todayEventsRes,
      recentPaymentsRes,
    ] = await Promise.all([
      supabase
        .from('recovery_cases')
        .select(`*, customers(id, customer_name, phone, customer_tier, last_whatsapp_status, last_whatsapp_activity)`)
        .eq('tenant_id', tenantId)
        .gt('total_outstanding', 0)
        .order('attention_score', { ascending: false })
        .limit(500),
      supabase
        .from('invoices')
        .select('*, customers(id, customer_name, phone, customer_tier, last_whatsapp_status, last_whatsapp_activity)')
        .eq('tenant_id', tenantId)
        .gt('outstanding_amount', 0)
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
      supabase
        .from('recovery_case_events')
        .select('case_id, recovery_cases!inner(tenant_id)')
        .eq('recovery_cases.tenant_id', tenantId)
        .gte('occurred_at', fmt(todayStart))
        .limit(200),
      // Recent merchant-relevant updates (last 24h): payments, promises, read status
      supabase
        .from('payments')
        .select('amount, created_at, customer_id, customers!inner(customer_name)')
        .eq('tenant_id', tenantId)
        .eq('status', 'paid')
        .gte('created_at', fmt(new Date(now.getTime() - 24 * 60 * 60 * 1000)))
        .order('created_at', { ascending: false })
        .limit(5),
    ])

    // ── Process results ──
    const activeCases = activeCasesRes.data || []
    const rawInvoices = unpaidInvoicesRes.data || []
    const recentPayments = (recentPaymentsRes.data || []).map((p: any) => ({
      type: 'payment' as const,
      customerName: (p.customers as any)?.customer_name ?? 'Customer',
      amount: parseFloat(p.amount) || 0,
      at: p.created_at,
    }))
    
    // Synthesize cases for customers who have unpaid invoices but NO active recovery_case
    const existingCustIds = new Set(activeCases.map(c => c.customer_id))
    const synthesizedCases: any[] = []
    
    // Group raw invoices by customer
    const groupedInvoices = new Map<string, any[]>()
    for (const inv of rawInvoices) {
      if (!groupedInvoices.has(inv.customer_id)) groupedInvoices.set(inv.customer_id, [])
      groupedInvoices.get(inv.customer_id)!.push(inv)
    }

    // Detect & repair: null customer_ids would create virtual cases with customerId=null,
    // which breaks the workspace navigation. Repair by assigning a walk-in customer.
    const nullInvs = groupedInvoices.get('null' as any) || groupedInvoices.get(null as any) || []
    if (nullInvs.length > 0) {
      console.warn('[RecoveryQueue] repair: repairing', nullInvs.length, 'invoices with null customer_id')
      const walkinId = await recoverWalkInCustomer(tenantId!)
      // Re-key the grouped invoices from null → walkinId
      groupedInvoices.delete(null as any)
      groupedInvoices.delete('null' as any)
      for (const inv of nullInvs) {
        inv.customer_id = walkinId
        if (!groupedInvoices.has(walkinId)) groupedInvoices.set(walkinId, [])
        groupedInvoices.get(walkinId)!.push(inv)
      }
    }
    
    for (const [custId, invs] of groupedInvoices.entries()) {
      if (!existingCustIds.has(custId)) {
        const first = invs[0]
        const total = invs.reduce((s, i) => s + (parseFloat(i.total) || 0) - (parseFloat(i.paid_amount) || 0), 0)
        const overdue = invs.filter(i => i.due_date && new Date(i.due_date) < now)
          .reduce((s, i) => s + (parseFloat(i.total) || 0) - (parseFloat(i.paid_amount) || 0), 0)
        
        const dueDates = invs
          .filter(i => i.due_date && new Date(i.due_date) < now)
          .map(i => new Date(i.due_date).getTime())
        const oldestOverdueDays = dueDates.length > 0
          ? Math.floor((now.getTime() - Math.min(...dueDates)) / (1000 * 60 * 60 * 24))
          : 0
        
        synthesizedCases.push({
          id: `virtual-${custId}`,
          tenant_id: tenantId,
          customer_id: custId,
          status: 'open',
          total_outstanding: total,
          total_overdue: overdue,
          oldest_overdue_days: oldestOverdueDays,
          recovery_state_v2: overdue > 0 ? 'overdue' : 'active',
          next_action_type: overdue > 0 ? 'send_reminder' : 'wait',
          engagement_state_v2: 'unseen',
          reminder_count: invs.reduce((s, i) => s + (i.reminder_count || 0), 0),
          last_activity_at: first.created_at,
          attention_score: overdue > 0 ? Math.min(50 + oldestOverdueDays, 100) : 10,
          customers: first.customers,
        })
      }
    }

    // ── Single source of truth: derive amounts from invoices for every case ──
    const invAmounts = (custId: string) => {
      const invs = groupedInvoices.get(custId) || []
      const out = invs.reduce((s: number, i: any) => s + (parseFloat(i.total) || 0) - (parseFloat(i.paid_amount) || 0), 0)
      const ovd = invs
        .filter((i: any) => i.due_date && new Date(i.due_date) < now)
        .reduce((s: number, i: any) => s + (parseFloat(i.total) || 0) - (parseFloat(i.paid_amount) || 0), 0)
      return { out, ovd }
    }

    const overrideCase = (c: any) => {
      const { out, ovd } = invAmounts(c.customer_id)
      c.total_outstanding = out
      c.total_overdue = ovd
      return c
    }

    const realCases = activeCases.map(overrideCase).filter((c: any) => c.total_outstanding > 0)
    const allCases = [...realCases, ...synthesizedCases]
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

    // ── NEW: Fetch priority cases (Udhar page shows all of them, so fetch generously) ──
    const priorityCases = await fetchPriorityCases(tenantId!, 200)

    // Merge synthesized cases into priority cases (RPC only queries recovery_cases table, misses virtual cases)
    const priorityCustIds = new Set(priorityCases.map(pc => pc.customerId))
    for (const sc of synthesizedCases) {
      if (priorityCustIds.has(sc.customer_id)) continue
      const cust = (sc.customers || {}) as any
      priorityCases.push({
        caseId: sc.id,
        customerId: sc.customer_id,
        customerName: cust.customer_name || 'Unknown',
        phone: cust.phone || '',
        totalOverdue: sc.total_overdue || sc.total_outstanding || 0,
        oldestOverdueDays: sc.oldest_overdue_days || 0,
        attentionScore: sc.attention_score || 10,
        priorityScore: sc.attention_score || 10,
        nextActionType: (sc.total_overdue || 0) > 0 ? 'send_reminder' : 'wait',
        promiseToPayDate: null,
        ignoredReminders: sc.reminder_count || 0,
        brokenPromises: 0,
        openInvoiceCount: (groupedInvoices.get(sc.customer_id) || []).length,
        automationMode: 'manual' as const,
      })
    }

    // Re-sort so most important cases come first regardless of origin
    priorityCases.sort((a, b) => b.attentionScore - a.attentionScore)

    // Override priority-case totals with invoice-derived amounts (single source of truth)
    for (const pc of priorityCases) {
      const { out } = invAmounts(pc.customerId)
      pc.totalOverdue = out
    }

    // Delivery status per customer (from the joined customers.row), used
    // to render a WhatsApp delivery chip on each queue card.
    const deliveryMap = new Map<string, { status: string | null; activity: string | null }>()
    for (const c of allCases) {
      const cust = c.customers as any
      if (!cust?.id) continue
      deliveryMap.set(cust.id, {
        status: cust.last_whatsapp_status || null,
        activity: cust.last_whatsapp_activity || null,
      })
    }

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

    // ── Queue action counts (for "Today's Queue" progress) ──
    // Only count real recovery cases — virtual cases can't have events yet
    const virtualCount = synthesizedCases.length
    const totalActions = realCases.length
    const realCaseIds = new Set(realCases.map((c: any) => c.id))
    const completedActions = [...new Set(
      (todayEventsRes.data || []).map((e: any) => e.case_id)
    )].filter(id => realCaseIds.has(id)).length
    const pendingActions = Math.max(0, totalActions - completedActions) + virtualCount

    // ── Promise summary ──
    const promiseSummary = { dueToday: 0, overdue: 0, upcoming: 0 }
    for (const c of allCases) {
      if (!c.promise_to_pay_date) continue
      const pd = new Date(c.promise_to_pay_date)
      if (pd >= todayStart && pd < new Date(todayStart.getTime() + 86400000)) {
        promiseSummary.dueToday++
      } else if (pd < todayStart) {
        promiseSummary.overdue++
      } else {
        promiseSummary.upcoming++
      }
    }

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
      recentActivity: recentPayments,
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
        totalActions,
        completedActions,
        pendingActions,
        promiseSummary,
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
          lastDeliveryStatus: deliveryMap.get(pc.customerId)?.status ?? null,
          lastDeliveryActivity: deliveryMap.get(pc.customerId)?.activity ?? null,
        })),
      },
    })
  } catch (err: any) {
    console.error('[RecoveryQueue] Error:', err)
    return NextResponse.json({ items: [], recoveredToday: 0, summary: zeroSummary() })
  }
}

/**
 * Self-heal: find or create a walk-in customer for a tenant,
 * then link orphaned invoices that have null customer_id.
 *
 * This prevents customerId=null from breaking workspace navigation.
 */
async function recoverWalkInCustomer(tenantId: string): Promise<string> {
  const walkinId = 'cust_walkin_' + tenantId

  const { data: existing } = await supabaseAdmin
    .from('customers')
    .select('id')
    .eq('id', walkinId)
    .maybeSingle()

  if (existing) {
    // Link any still-orphan invoices
    await supabaseAdmin
      .from('invoices')
      .update({ customer_id: walkinId })
      .eq('tenant_id', tenantId)
      .is('customer_id', null)
      .gt('outstanding_amount', 0)
    return walkinId
  }

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

  // Link orphan invoices
  const { data: updated } = await supabaseAdmin
    .from('invoices')
    .update({ customer_id: walkinId })
    .eq('tenant_id', tenantId)
    .is('customer_id', null)
    .gt('outstanding_amount', 0)
    .select('id, outstanding_amount')

  // Create a recovery case for the walk-in if there are invoices
  if (updated && updated.length > 0) {
    const totalOs = updated.reduce((s: number, inv: any) => s + (parseFloat(inv.outstanding_amount) || 0), 0)
    await supabaseAdmin.from('recovery_cases').upsert({
      tenant_id: tenantId,
      customer_id: walkinId,
      total_outstanding: totalOs,
      recovery_state_v2: 'overdue',
      next_action_type: 'send_reminder',
      attention_score: 50,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'tenant_id,customer_id' })
  }

  return walkinId
}
