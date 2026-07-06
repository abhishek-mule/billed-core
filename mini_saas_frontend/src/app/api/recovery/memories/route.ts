import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import { verifyRequest } from '@/lib/billzo/api-middleware'
import { buildMerchantMemory, buildAggregateInsights } from '@billzo/shared'
import type { MerchantMemory, BusinessInsight, CustomerBehavioralMetrics, CustomerLiquidityWindow } from '@billzo/shared'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyRequest(request)
    if (auth.response) return auth.response
    const { tenantId } = auth

    const { memories, insights } = await loadMerchantMemories(tenantId!)

    return NextResponse.json({ memories, insights })
  } catch (err) {
    console.error('[memories] error:', err)
    return NextResponse.json({ memories: [], insights: [] })
  }
}

async function loadMerchantMemories(tenantId: string): Promise<{ memories: MerchantMemory[]; insights: BusinessInsight[] }> {
  const [metricsRes, windowsRes] = await Promise.all([
    supabaseAdmin
      .from('customer_behavioral_metrics')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('observation_count', { ascending: false }),
    supabaseAdmin
      .from('customer_liquidity_windows')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('window_type', 'weekly')
      .order('affinity_score', { ascending: false }),
  ])

  // If no behavioral data exists, backfill from invoice/payment data
  if (!metricsRes.data || metricsRes.data.length === 0) {
    return backfillAndBuildMemories(tenantId)
  }

  const allMemories: MerchantMemory[] = []
  const metricsList: CustomerBehavioralMetrics[] = []
  const windowsList: CustomerLiquidityWindow[] = (windowsRes.data || []).map(mapWindow)

  for (const row of metricsRes.data) {
    const metrics: CustomerBehavioralMetrics = mapMetrics(row)
    metricsList.push(metrics)
    const windows: CustomerLiquidityWindow[] = windowsList.filter(w => w.customerId === row.customer_id)

    const customerMemories = buildMerchantMemory({ metrics, liquidityWindows: windows })
    if (customerMemories.length > 0) {
      allMemories.push(...customerMemories.map(m => ({
        ...m,
        customerName: row.customer_name || undefined,
        observation: `${row.customer_name ? row.customer_name + ' — ' : ''}${m.observation}`,
      })))
    }
  }

  const insights = buildAggregateInsights(metricsList, windowsList)

  return {
    memories: allMemories.sort((a, b) => b.confidence - a.confidence),
    insights,
  }
}

async function backfillAndBuildMemories(tenantId: string): Promise<{ memories: MerchantMemory[]; insights: BusinessInsight[] }> {
  const [paymentsRes, invoicesRes] = await Promise.all([
    supabaseAdmin
      .from('payments')
      .select('id, invoice_id, customer_id, amount, paid_at')
      .eq('tenant_id', tenantId)
      .not('paid_at', 'is', null),
    supabaseAdmin
      .from('invoices')
      .select('id, customer_id, customer_name, due_date, total, status')
      .eq('tenant_id', tenantId),
  ])

  const invoices = invoicesRes.data || []
  const invoiceMap = new Map(invoices.map(i => [i.id, i]))
  const payments = paymentsRes.data || []

  if (payments.length === 0) return { memories: [], insights: [] }

  const customerGroups = new Map<string, { name: string; payments: any[] }>()
  for (const p of payments) {
    const inv = invoiceMap.get(p.invoice_id)
    if (!inv) continue
    const cid = inv.customer_id
    if (!customerGroups.has(cid)) {
      customerGroups.set(cid, { name: inv.customer_name || 'Unknown', payments: [] })
    }
    customerGroups.get(cid)!.payments.push({ ...p, invoice: inv })
  }

  const allMemories: MerchantMemory[] = []
  const metricsList: CustomerBehavioralMetrics[] = []
  const windowsList: CustomerLiquidityWindow[] = []

  for (const [customerId, group] of customerGroups) {
    const settlementLatencies: number[] = []
    for (const p of group.payments) {
      if (p.paid_at && p.invoice.due_date) {
        const diffMs = new Date(p.paid_at).getTime() - new Date(p.invoice.due_date).getTime()
        settlementLatencies.push(Math.max(0, diffMs / 3600000))
      }
    }

    const avgSettlement = settlementLatencies.length > 0
      ? settlementLatencies.reduce((s, h) => s + h, 0) / settlementLatencies.length
      : 0

    const metrics: CustomerBehavioralMetrics = {
      tenantId,
      customerId,
      schemaVersion: 1,
      readRate: 0.5,
      paymentConversionRate: 1,
      avgReadToPayHours: 0,
      avgReminderResponseHours: 0,
      avgSettlementLatencyHours: avgSettlement,
      observationCount: group.payments.length,
      totalInterventionsSent: group.payments.length,
      totalInterventionsRead: Math.round(group.payments.length * 0.5),
      totalResolutionsAfterIntervention: group.payments.length,
      totalEscalationsReceived: 0,
      lastEscalationAt: null,
      interventionsUntilResolution: 1,
      lastResolutionAt: new Date().toISOString(),
      lastReadAt: null,
      lastResponseAt: null,
      lastEventAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    metricsList.push(metrics)

    // Build liquidity windows from payment data
    const windowMap = new Map<string, { weekday: number; hour: number; count: number }>()
    for (const p of group.payments) {
      if (!p.paid_at) continue
      const d = new Date(p.paid_at)
      const key = `${d.getDay()}-${d.getHours()}`
      const existing = windowMap.get(key)
      if (existing) {
        existing.count++
      } else {
        windowMap.set(key, { weekday: d.getDay(), hour: d.getHours(), count: 1 })
      }
    }
    const windows: CustomerLiquidityWindow[] = Array.from(windowMap.entries()).map(([_, w]) => ({
      tenantId,
      customerId,
      schemaVersion: 1,
      windowType: 'weekly',
      weekday: w.weekday,
      hourBucket: w.hour,
      affinityScore: w.count,
      observationCount: w.count,
      lastSeenAt: null,
    }))
    windowsList.push(...windows)

    const customerMemories = buildMerchantMemory({ metrics, liquidityWindows: windows })
    if (customerMemories.length > 0) {
      allMemories.push(...customerMemories.map(m => ({
        ...m,
        customerName: group.name,
        observation: `${group.name} — ${m.observation}`,
      })))
    }
  }

  const insights = buildAggregateInsights(metricsList, windowsList)

  return {
    memories: allMemories.sort((a, b) => b.confidence - a.confidence),
    insights,
  }
}

function mapMetrics(row: any): CustomerBehavioralMetrics {
  return {
    tenantId: row.tenant_id,
    customerId: row.customer_id,
    schemaVersion: row.schema_version,
    readRate: Number(row.read_rate) || 0,
    paymentConversionRate: Number(row.payment_conversion_rate) || 0,
    avgReadToPayHours: Number(row.avg_read_to_pay_hours) || 0,
    avgReminderResponseHours: Number(row.avg_reminder_response_hours) || 0,
    avgSettlementLatencyHours: Number(row.avg_settlement_latency_hours) || 0,
    observationCount: row.observation_count || 0,
    totalInterventionsSent: row.total_interventions_sent || 0,
    totalInterventionsRead: Number(row.total_interventions_read) || 0,
    totalResolutionsAfterIntervention: row.total_resolutions_after_intervention || 0,
    totalEscalationsReceived: row.total_escalations_received || 0,
    lastEscalationAt: row.last_escalation_at,
    interventionsUntilResolution: row.interventions_until_resolution,
    lastResolutionAt: row.last_resolution_at,
    lastReadAt: row.last_read_at,
    lastResponseAt: row.last_response_at,
    lastEventAt: row.last_event_at,
    updatedAt: row.updated_at,
  }
}

function mapWindow(row: any): CustomerLiquidityWindow {
  return {
    tenantId: row.tenant_id,
    customerId: row.customer_id,
    schemaVersion: row.schema_version,
    windowType: row.window_type,
    weekday: row.weekday,
    hourBucket: row.hour_bucket,
    affinityScore: Number(row.affinity_score) || 0,
    observationCount: row.observation_count || 0,
    lastSeenAt: row.last_seen_at,
  }
}
