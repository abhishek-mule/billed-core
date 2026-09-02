import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import { buildRecoveryDecision, type RecoveryDecision } from './recovery-decision'

/**
 * Home Decision — the single authoritative financial + exception summary
 * for a merchant's Home page. No case-level cards — those belong in Recovery.
 * Home answers: "How is my money doing?"
 * Recovery answers: "What needs to happen, and what is BillZo doing?"
 */

export type HomeDecision = {
  financial: {
    totalOutstanding: number
    inRecovery: number
    recoveredThisMonth: number
  }
  recoveryFocus: {
    amount: number
    customerCount: number
  }
  recoveryPerformance: {
    recovered: number
    totalOutstanding: number
    rate: number
  }
  sections: {
    needsYou: number
    automated: number
    monitoring: number
  }
  exceptions: {
    missingPhone: number
    brokenPromises: number
    failedReminders: number
    paymentToReview: number
  }
  generatedAt: string
}

const ACTIVE_STATES = ['active', 'overdue', 'partial_payment', 'promised', 'disputed']

const invoiceOutstanding = (i: any) =>
  Number(i.outstanding_amount) > 0
    ? Number(i.outstanding_amount)
    : Math.max(0, (Number(i.grand_total || i.total || 0)) - (Number(i.paid_amount) || 0))

function sectionFor(state: RecoveryDecision['state']): 'needs_you' | 'automated' | 'monitoring' {
  switch (state) {
    case 'blocked_phone': return 'needs_you'
    case 'call': return 'needs_you'
    case 'remind': return 'automated'
    case 'waiting': return 'monitoring'
    case 'recovered': return 'monitoring'
    default: return 'monitoring'
  }
}

export async function getHomeDecision(tenantId: string): Promise<HomeDecision> {
  const now = new Date()

  // ── Open cases ──
  const { data: cases } = await supabaseAdmin
    .from('recovery_cases')
    .select('id, customer_id, total_outstanding')
    .eq('tenant_id', tenantId)
    .gt('total_outstanding', 0)
    .in('recovery_state_v2', ACTIVE_STATES)
    .limit(100)

  const customerIds = [...new Set((cases || []).map((c: any) => c.customer_id).filter(Boolean))]
  if (customerIds.length === 0) {
    return {
      financial: { totalOutstanding: 0, inRecovery: 0, recoveredThisMonth: 0 },
      recoveryFocus: { amount: 0, customerCount: 0 },
      recoveryPerformance: { recovered: 0, totalOutstanding: 0, rate: 0 },
      sections: { needsYou: 0, automated: 0, monitoring: 0 },
      exceptions: { missingPhone: 0, brokenPromises: 0, failedReminders: 0, paymentToReview: 0 },
      generatedAt: now.toISOString(),
    }
  }

  const [customersRes, invoicesRes, actionsRes, promisesRes] = await Promise.all([
    supabaseAdmin
      .from('customers')
      .select('id, customer_name, phone, customer_tier, automation_mode')
      .in('id', customerIds),
    supabaseAdmin
      .from('invoices')
      .select('id, customer_id, invoice_number, total, grand_total, paid_amount, outstanding_amount, status, due_date, created_at')
      .eq('tenant_id', tenantId)
      .in('customer_id', customerIds)
      .limit(500),
    supabaseAdmin
      .from('collection_actions')
      .select('id, customer_id, action_type, status, completed_at, invoice_ids')
      .eq('tenant_id', tenantId)
      .in('customer_id', customerIds)
      .limit(500),
    supabaseAdmin
      .from('payment_promises')
      .select('id, customer_id, promise_date, status')
      .eq('tenant_id', tenantId)
      .in('customer_id', customerIds)
      .limit(500),
  ])

  const customers = customersRes.data || []
  const invoices = invoicesRes.data || []
  const actions = actionsRes.data || []
  const promises = promisesRes.data || []

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

  let needsYouCount = 0
  let automatedCount = 0
  let monitoringCount = 0
  let missingPhoneCount = 0
  let brokenPromisesCount = 0
  let failedRemindersCount = 0
  let paymentToReviewCount = 0
  let focusAmount = 0
  let focusCount = 0

  // One customer → one decision. Compute section counts and exception counts.
  for (const custId of customerIds) {
    const cust = custMap.get(custId) || {}
    const custInvoices = invByCust.get(custId) || []
    if (custInvoices.length === 0) continue

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
    })

    const sec = sectionFor(decision.state)
    if (sec === 'needs_you') needsYouCount++
    else if (sec === 'automated') automatedCount++
    else monitoringCount++

    if (!cust.phone) missingPhoneCount++
    if (decision.state === 'call' && custPromises.some(p => p.status === 'broken')) brokenPromisesCount++
    if (custActions.some(a => deliveryByAction[a.id]?.failedAt)) failedRemindersCount++

    // Payment to review: possible bank match with low confidence
    // This would come from a separate bank reconciliation table
    // For now, we check for any payment promises that are active but overdue
    if (custPromises.some(p => p.status === 'active' && new Date(p.promiseDate) < now)) {
      paymentToReviewCount++
    }

    focusAmount += outstanding
    focusCount++
  }

  // Calculate high-level financial metrics
  const { data: allTenantInvoices } = await supabaseAdmin
    .from('invoices')
    .select('grand_total, total, paid_amount, outstanding_amount, status, created_at')
    .eq('tenant_id', tenantId)
    .limit(1000)

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  let totalOutstanding = 0
  let recoveredThisMonth = 0

  for (const inv of allTenantInvoices || []) {
    const invStatus = inv.status as string
    if (invStatus !== 'paid' && invStatus !== 'cancelled') {
      totalOutstanding += invoiceOutstanding(inv)
    }
    if (invStatus === 'paid') {
      const invDate = new Date(inv.created_at || 0)
      if (invDate >= startOfMonth) {
        recoveredThisMonth += Number(inv.grand_total || inv.total || 0)
      }
    }
  }

  const recoveryRate = totalOutstanding > 0
    ? Math.round((recoveredThisMonth / (totalOutstanding + recoveredThisMonth)) * 100)
    : 0

  return {
    financial: {
      totalOutstanding: Math.max(totalOutstanding, focusAmount),
      inRecovery: focusAmount,
      recoveredThisMonth,
    },
    recoveryFocus: { amount: focusAmount, customerCount: focusCount },
    recoveryPerformance: { recovered: recoveredThisMonth, totalOutstanding: totalOutstanding + recoveredThisMonth, rate: recoveryRate },
    sections: { needsYou: needsYouCount, automated: automatedCount, monitoring: monitoringCount },
    exceptions: { missingPhone: missingPhoneCount, brokenPromises: brokenPromisesCount, failedReminders: failedRemindersCount, paymentToReview: paymentToReviewCount },
    generatedAt: now.toISOString(),
  }
}
