import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { buildQueueItems } from '@/lib/recovery/queue-service'
import { verifyRequest } from '@/lib/billzo/api-middleware'

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
})

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyRequest(request)
    if (auth.response) return auth.response
    const { tenantId } = auth

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
        .select(`*, customers(customer_name, phone, customer_tier)`)
        .eq('tenant_id', tenantId)
        .gt('total_outstanding', 0)
        .order('attention_score', { ascending: false })
        .limit(50),
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
    if (activeCasesRes.error) {
      console.warn('[RecoveryQueue] Failed to fetch active cases:', activeCasesRes.error.message)
    }

    const queue = buildQueueItems(activeCases)

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

    // ── Summary ──
    const outstanding = activeCases.reduce(
      (s: number, c: any) => s + (parseFloat(c.total_outstanding) || 0), 0
    )

    const dueToday = activeCases.filter((c: any) => {
      if (!c.promise_to_pay_date) return false
      const d = new Date(c.promise_to_pay_date)
      return d <= now
    }).reduce((s: number, c: any) => s + (parseFloat(c.total_overdue) || 0), 0)

    return NextResponse.json({
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
      },
    })
  } catch (err: any) {
    console.error('[RecoveryQueue] Error:', err)
    return NextResponse.json({ items: [], recoveredToday: 0, summary: zeroSummary() })
  }
}
