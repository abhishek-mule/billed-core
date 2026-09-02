import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import { buildRecoveryDecision, type RecoveryDecision } from './recovery-decision'

/**
 * Recovery Card — flat card for the Recovery Command Center
 * One card = one customer = one decision = one dominant CTA
 * Sections: NEEDS YOU | BILLZO IS HANDLING | MONITORING
 */

export type RecoveryCard = {
  customerId: string
  customerName: string
  phone: string | null
  outstanding: number
  invoiceCount: number
  maxOverdueDays: number
  section: 'needs_you' | 'automated' | 'monitoring'
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
    totalOutstanding: number
  }
  needsYou: RecoveryCard[]
  billzoIsHandling: RecoveryCard[]
  monitoring: RecoveryCard[]
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
    case 'blocked_transport': return 'needs_you'
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
    .select('id, customer_id, total_outstanding')
    .eq('tenant_id', tenantId)
    .gt('total_outstanding', 0)
    .in('recovery_state_v2', ACTIVE_STATES)
    .limit(100)

  const customerIds = [...new Set((cases || []).map((c: any) => c.customer_id).filter(Boolean))]
  if (customerIds.length === 0) {
    return {
      summary: { totalCases: 0, needsYou: 0, automated: 0, monitoring: 0, totalOutstanding: 0 },
      needsYou: [],
      billzoIsHandling: [],
      monitoring: [],
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

  const cards: RecoveryCard[] = []

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

    const sec = sectionFor(decision.state)

    cards.push({
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

  const totalOutstanding = cards.reduce((s, c) => s + c.outstanding, 0)

  return {
    summary: {
      totalCases: cards.length,
      needsYou: needsYou.length,
      automated: billzoIsHandling.length,
      monitoring: monitoring.length,
      totalOutstanding,
    },
    needsYou,
    billzoIsHandling,
    monitoring,
    generatedAt: now.toISOString(),
  }
}