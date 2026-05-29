import { supabaseAdmin } from '../billzo/supabase-admin'
import type { AttentionItem } from './types'

export async function computeAttentionItems(tenantId: string): Promise<AttentionItem[]> {
  const items: AttentionItem[] = []

  const cashflowItems = await computeCashflowItems(tenantId)
  items.push(...cashflowItems)

  const anomalyItems = await computePaymentAnomalyItems(tenantId)
  items.push(...anomalyItems)

  const commFailureItems = await computeCommunicationFailureItems(tenantId)
  items.push(...commFailureItems)

  return items
}

async function computeCashflowItems(tenantId: string): Promise<AttentionItem[]> {
  const { data: invoices } = await supabaseAdmin
    .from('invoices')
    .select(`
      id, total, due_date, status, recovery_stage, customer_id,
      customers!inner(name),
      tenant_id
    `)
    .eq('tenant_id', tenantId)
    .in('status', ['unpaid', 'overdue'])
    .lte('next_recovery_at', new Date().toISOString())

  if (!invoices || invoices.length === 0) return []

  const { data: metrics } = await supabaseAdmin
    .from('customer_behavioral_metrics')
    .select('*')
    .eq('tenant_id', tenantId)

  const metricsMap = new Map<string, Record<string, any>>()
  if (metrics) {
    for (const m of metrics) {
      metricsMap.set(m.customer_id, m)
    }
  }

  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('attention_weights')
    .eq('id', tenantId)
    .single()

  const weights = (tenant?.attention_weights || {}) as Record<string, number>
  const overdueWeight = weights.overdue_weight ?? 10
  const amountWeight = weights.amount_weight ?? 5
  const behavioralWeight = weights.behavioral_weight ?? 8
  const urgencyWeight = weights.urgency_weight ?? 15

  const items: AttentionItem[] = []

  for (const inv of invoices) {
    const b = metricsMap.get(inv.customer_id)
    const daysOverdue = Math.max(0, Math.floor((Date.now() - new Date(inv.due_date || Date.now()).getTime()) / (24 * 60 * 60 * 1000)))
    const normalizedAmount = Math.min((inv.total || 0) / 100000, 1)
    const delayLikelihood = b?.strategic_delay_likelihood ?? 0.3
    const stageScore = inv.recovery_stage === 't5_warning' ? 4
      : inv.recovery_stage === 't72_strong' ? 3
      : inv.recovery_stage === 't24_nudge' ? 2
      : inv.recovery_stage === 't0_soft' ? 1 : 0

    const score = overdueWeight * daysOverdue + amountWeight * normalizedAmount + behavioralWeight * delayLikelihood + urgencyWeight * stageScore

    const urgency = score >= 40 ? 'critical' : score >= 20 ? 'high' : score >= 10 ? 'medium' : 'low'

    const intentType = stageScore >= 3 ? 'escalation_required' : daysOverdue > 7 ? 'overdue_risk' : 'payment_pending'

    items.push({
      id: crypto.randomUUID(),
      tenantId: inv.tenant_id,
      situationId: null,
      intentType,
      entityType: 'invoice',
      entityId: inv.id,
      priorityScore: score,
      urgency: urgency as any,
      confidence: 0.85,
      signalData: {
        customer_id: inv.customer_id,
        customer_name: (inv as any).customers?.name,
        total: inv.total,
        due_date: inv.due_date,
        days_overdue: daysOverdue,
        recovery_stage: inv.recovery_stage,
        normalized_amount: normalizedAmount,
        delay_likelihood: delayLikelihood,
        stage_score: stageScore,
      },
      correlationKey: `cashflow:${tenantId}:${inv.customer_id}`,
      createdAt: new Date().toISOString(),
    })
  }

  return items
}

async function computePaymentAnomalyItems(tenantId: string): Promise<AttentionItem[]> {
  const items: AttentionItem[] = []

  const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()

  // Stale partials: invoices marked partial with no payment in 7+ days
  const { data: stalePartials } = await supabaseAdmin
    .from('invoices')
    .select('id, total, paid_amount, due_date, customer_id, customers!inner(name), tenant_id, updated_at')
    .eq('tenant_id', tenantId)
    .eq('status', 'partial')
    .lt('updated_at', fortyEightHoursAgo)

  if (stalePartials) {
    for (const inv of stalePartials) {
      const outstanding = (inv.total || 0) - (inv.paid_amount || 0)
      const daysSinceUpdate = Math.floor((Date.now() - new Date(inv.updated_at).getTime()) / (24 * 60 * 60 * 1000))
      const score = Math.min(outstanding / 1000, 30) + daysSinceUpdate * 2

      items.push({
        id: crypto.randomUUID(),
        tenantId,
        situationId: null,
        intentType: 'payment_anomaly',
        entityType: 'invoice',
        entityId: inv.id,
        priorityScore: score,
        urgency: score >= 20 ? 'high' : 'medium',
        confidence: 0.7,
        signalData: {
          customer_id: inv.customer_id,
          customer_name: (inv as any).customers?.name,
          total: inv.total,
          paid_amount: inv.paid_amount,
          outstanding,
          days_since_last_activity: daysSinceUpdate,
          anomaly_type: 'stale_partial',
        },
        correlationKey: `payment_anomaly:${tenantId}:${inv.customer_id}`,
        createdAt: new Date().toISOString(),
      })
    }
  }

  // Orphan payments: payments received in last 48h not linked to any known invoice
  const { data: orphanPayments } = await supabaseAdmin
    .from('payments')
    .select('id, amount, created_at, invoice_id')
    .eq('tenant_id', tenantId)
    .gte('created_at', fortyEightHoursAgo)

  if (orphanPayments) {
    for (const pmt of orphanPayments) {
      const { data: invoice } = await supabaseAdmin
        .from('invoices')
        .select('id, customer_id, customers!inner(name)')
        .eq('id', pmt.invoice_id)
        .single()

      if (!invoice) {
        items.push({
          id: crypto.randomUUID(),
          tenantId,
          situationId: null,
          intentType: 'payment_anomaly',
          entityType: 'payment',
          entityId: pmt.id,
          priorityScore: Math.min((pmt.amount || 0) / 1000, 25),
          urgency: 'medium',
          confidence: 0.5,
          signalData: {
            payment_id: pmt.id,
            amount: pmt.amount,
            received_at: pmt.created_at,
            anomaly_type: 'orphan_payment',
          },
          correlationKey: `payment_anomaly:${tenantId}:orphan`,
          createdAt: new Date().toISOString(),
        })
      }
    }
  }

  return items
}

async function computeCommunicationFailureItems(tenantId: string): Promise<AttentionItem[]> {
  const items: AttentionItem[] = []
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  // Customers with 3+ consecutive failed delivery attempts in last 7 days
  const { data: failureClusters } = await supabaseAdmin
    .from('whatsapp_events')
    .select('invoice_id, tenant_id, count')
    .eq('tenant_id', tenantId)
    .eq('status', 'failed')
    .gte('occurred_at', sevenDaysAgo)

  if (failureClusters) {
    // Aggregate by invoice to find those with >= 3 failures
    const failMap = new Map<string, number>()
    for (const ev of failureClusters) {
      failMap.set(ev.invoice_id, (failMap.get(ev.invoice_id) || 0) + 1)
    }

    for (const [invoiceId, count] of failMap) {
      if (count < 3) continue

      const { data: inv } = await supabaseAdmin
        .from('invoices')
        .select('id, customer_id, customers!inner(name), total, tenant_id')
        .eq('id', invoiceId)
        .single()

      if (!inv) continue

      const score = Math.min(count * 5, 35)

      items.push({
        id: crypto.randomUUID(),
        tenantId,
        situationId: null,
        intentType: 'communication_failure',
        entityType: 'invoice',
        entityId: invoiceId,
        priorityScore: score,
        urgency: count >= 5 ? 'critical' : 'high',
        confidence: 0.8,
        signalData: {
          customer_id: inv.customer_id,
          customer_name: (inv as any).customers?.name,
          invoice_total: inv.total,
          failure_count: count,
          anomaly_type: 'delivery_failure',
        },
        correlationKey: `communication_failure:${tenantId}:${inv.customer_id}`,
        createdAt: new Date().toISOString(),
      })
    }
  }

  // Silent customers: delivered but unread for 7+ days
  const { data: silentDeliveries } = await supabaseAdmin
    .from('whatsapp_events')
    .select('invoice_id, tenant_id, occurred_at')
    .eq('tenant_id', tenantId)
    .not('delivered_at', 'is', null)
    .is('read_at', null)
    .gte('occurred_at', sevenDaysAgo)

  if (silentDeliveries) {
    const silentMap = new Map<string, { count: number; lastAt: string }>()
    for (const ev of silentDeliveries) {
      const existing = silentMap.get(ev.invoice_id)
      if (!existing || ev.occurred_at > existing.lastAt) {
        silentMap.set(ev.invoice_id, {
          count: (existing?.count || 0) + 1,
          lastAt: ev.occurred_at,
        })
      }
    }

    for (const [invoiceId, info] of silentMap) {
      if (info.count < 2) continue

      const { data: inv } = await supabaseAdmin
        .from('invoices')
        .select('id, customer_id, customers!inner(name), total, tenant_id')
        .eq('id', invoiceId)
        .single()

      if (!inv) continue

      const score = Math.min(info.count * 4, 30)

      items.push({
        id: crypto.randomUUID(),
        tenantId,
        situationId: null,
        intentType: 'communication_failure',
        entityType: 'invoice',
        entityId: invoiceId,
        priorityScore: score,
        urgency: 'medium',
        confidence: 0.6,
        signalData: {
          customer_id: inv.customer_id,
          customer_name: (inv as any).customers?.name,
          invoice_total: inv.total,
          unread_count: info.count,
          last_delivered_at: info.lastAt,
          anomaly_type: 'silent_customer',
        },
        correlationKey: `communication_failure:${tenantId}:${inv.customer_id}`,
        createdAt: new Date().toISOString(),
      })
    }
  }

  return items
}
