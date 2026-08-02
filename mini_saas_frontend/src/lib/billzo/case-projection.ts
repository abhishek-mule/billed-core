import { supabaseAdmin } from '@/lib/billzo/supabase-admin'

/* ─── Types (local — avoids shared package rebuild dependency) ──────── */

export type CaseInfo = {
  id: string
  status: string
  recoveryScore?: number
  priority: string
  outstandingAmount: number
  overdueDays: number
  customer: CustomerInfo | null
}

export type CustomerInfo = {
  id: string
  name: string
  phone: string
  email: string | null
  tier: string | null
  gstin: string | null
}

export type SummaryInfo = {
  totalOutstanding: number
  invoiceCount: number
  oldestInvoiceDays: number
  lastPaymentAt: string | null
  lastContactAt: string | null
}

export type InvoiceItem = {
  id: string
  number: string | null
  amount: number
  status: string
  dueDate: string | null
  overdueDays: number
}

export type PromiseItem = {
  id: string
  date: string | null
  amount: number
  status: string
  createdAt: string
  note: string | null
}

export type TimelineItem = {
  id: string
  type: string
  title: string
  description: string
  timestamp: string
  severity: string
}

export type NoteItem = {
  id: string
  note: string
  isPinned: boolean
  createdAt: string
}

export type Recommendation = {
  nextBestAction: string
  urgency: 'high' | 'medium' | 'low'
  reason: string
}

export type CaseMetrics = {
  reminderCount: number
  callCount: number
  promiseCount: number
  promiseBrokenCount: number
}

export type CaseHealth = {
  stale: boolean
  lastUpdated: string | null
}

export interface CaseProjection {
  case: CaseInfo
  summary: SummaryInfo
  invoices: InvoiceItem[]
  promises: PromiseItem[]
  timeline: TimelineItem[]
  notes: NoteItem[]
  recommendations: Recommendation | null
  metrics: CaseMetrics
  health: CaseHealth
}

const STALE_THRESHOLD_MS = 10 * 60 * 1000

export async function getCaseProjection(tenantId: string, caseId: string): Promise<CaseProjection> {
  const [caseInfo, invoices, promises, activities, notes, collectionActions] = await Promise.all([
    fetchCase(tenantId, caseId),
    fetchInvoices(tenantId, caseId),
    fetchPromises(tenantId, caseId),
    fetchActivities(tenantId, caseId),
    fetchNotes(tenantId, caseId),
    fetchCollectionActions(tenantId, caseId),
  ])

  if (!caseInfo) {
    throw new Error('Case not found')
  }
  const overdueDays = invoices.length > 0 ? Math.max(...invoices.map((i) => i.overdueDays)) : 0
  const caseWithOverdue = { ...caseInfo, overdueDays }
  const summary = buildSummary(caseWithOverdue, invoices)
  const timeline = buildTimeline(activities)
  const metrics = buildMetrics(collectionActions, promises)
  const recommendations = buildRecommendations(caseWithOverdue, metrics, timeline)
  const health = buildHealth(caseInfo)

  return {
    case: caseWithOverdue,
    summary,
    invoices,
    promises,
    timeline,
    notes,
    recommendations,
    metrics,
    health,
  }
}

/* ─── Fetchers ───────────────────────────────────────────────────────── */

async function fetchCase(tenantId: string, caseId: string): Promise<CaseInfo | null> {
  const { data: rc } = await supabaseAdmin
    .from('recovery_cases')
    .select('id, customer_id, total_outstanding, recovery_state_v2, next_action_type')
    .eq('tenant_id', tenantId)
    .eq('id', caseId)
    .maybeSingle()

  if (!rc) return null

  let customer: CustomerInfo | null = null

  if (rc.customer_id) {
    const { data: cust } = await supabaseAdmin
      .from('customers')
      .select('id, customer_name, phone, email, customer_tier, gstin')
      .eq('id', rc.customer_id)
      .maybeSingle()

    if (cust) {
      customer = {
        id: cust.id,
        name: cust.customer_name,
        phone: cust.phone || '',
        email: cust.email,
        tier: cust.customer_tier,
        gstin: cust.gstin,
      }
    }
  }

  return {
    id: rc.id,
    status: rc.recovery_state_v2 || 'active',
    priority: rc.next_action_type === 'call' ? 'high' : 'medium',
    outstandingAmount: Number(rc.total_outstanding || 0),
    overdueDays: 0,
    customer,
  }
}

async function fetchInvoices(tenantId: string, caseId: string): Promise<InvoiceItem[]> {
  const { data: rc } = await supabaseAdmin
    .from('recovery_cases')
    .select('customer_id')
    .eq('id', caseId)
    .single()

  if (!rc) return []

  const now = new Date()

  let query = supabaseAdmin
    .from('invoices')
    .select('id, invoice_number, grand_total, total, paid_amount, outstanding_amount, status, due_date')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (rc.customer_id) {
    query = query.eq('customer_id', rc.customer_id)
  }

  const { data: invoices } = await query

  const outstanding = (i: any) =>
    Number(i.outstanding_amount) > 0
      ? Number(i.outstanding_amount)
      : Math.max(0, (Number(i.grand_total || i.total || 0)) - (Number(i.paid_amount) || 0))

  return (invoices || [])
    .filter((i: any) => outstanding(i) > 0)
    .map((i: any) => ({
      id: i.id,
      number: i.invoice_number,
      amount: outstanding(i),
      status: i.status,
      dueDate: i.due_date,
      overdueDays: i.due_date
        ? Math.max(0, Math.floor((now.getTime() - new Date(i.due_date).getTime()) / 86400000))
        : 0,
    }))
}

async function fetchPromises(tenantId: string, caseId: string): Promise<PromiseItem[]> {
  const { data: rc } = await supabaseAdmin
    .from('recovery_cases')
    .select('customer_id')
    .eq('id', caseId)
    .single()

  if (!rc?.customer_id) return []

  const { data: promises } = await supabaseAdmin
    .from('payment_promises')
    .select('id, promise_date, promise_amount, status, created_at, note')
    .eq('tenant_id', tenantId)
    .eq('customer_id', rc.customer_id)
    .order('created_at', { ascending: false })
    .limit(20)

  return (promises || []).map((p: any) => ({
    id: p.id,
    date: p.promise_date,
    amount: Number(p.promise_amount || 0),
    status: p.status,
    createdAt: p.created_at,
    note: p.note,
  }))
}

async function fetchActivities(tenantId: string, caseId: string): Promise<any[]> {
  const { data } = await supabaseAdmin
    .from('recovery_activities')
    .select('id, type, metadata, created_at')
    .eq('tenant_id', tenantId)
    .eq('case_id', caseId)
    .order('created_at', { ascending: false })
    .limit(50)

  return data || []
}

async function fetchNotes(tenantId: string, caseId: string): Promise<NoteItem[]> {
  const { data: rc } = await supabaseAdmin
    .from('recovery_cases')
    .select('customer_id')
    .eq('id', caseId)
    .single()

  if (!rc?.customer_id) return []

  const { data: notes } = await supabaseAdmin
    .from('merchant_customer_notes')
    .select('id, note, is_pinned, created_at')
    .eq('tenant_id', tenantId)
    .eq('customer_id', rc.customer_id)
    .is('archived_at', null)
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(100)

  return (notes || []).map((n: any) => ({
    id: n.id,
    note: n.note,
    isPinned: n.is_pinned || false,
    createdAt: n.created_at,
  }))
}

async function fetchCollectionActions(tenantId: string, caseId: string): Promise<any[]> {
  const { data: rc } = await supabaseAdmin
    .from('recovery_cases')
    .select('customer_id')
    .eq('id', caseId)
    .single()

  if (!rc?.customer_id) return []

  const { data: actions } = await supabaseAdmin
    .from('collection_actions')
    .select('id, action_type, status')
    .eq('tenant_id', tenantId)
    .eq('customer_id', rc.customer_id)
    .limit(200)

  return actions || []
}

/* ─── Builders ───────────────────────────────────────────────────────── */

function buildSummary(caseInfo: CaseInfo, invoices: InvoiceItem[]): SummaryInfo {
  const overdueInvs = invoices.filter((i) => i.overdueDays > 0)
  const oldestInvoiceDays = overdueInvs.length > 0
    ? Math.max(...overdueInvs.map((i) => i.overdueDays))
    : 0

  return {
    totalOutstanding: caseInfo.outstandingAmount,
    invoiceCount: invoices.length,
    oldestInvoiceDays,
    lastPaymentAt: null,
    lastContactAt: null,
  }
}

function buildTimeline(activities: any[]): TimelineItem[] {
  return activities.map((a: any) => ({
    id: a.id,
    type: a.type,
    title: timelineTitle(a.type, a.metadata),
    description: a.metadata?.note || '',
    timestamp: a.created_at,
    severity: severityForType(a.type),
  }))
}

function buildMetrics(actions: any[], promises: PromiseItem[]): CaseMetrics {
  return {
    reminderCount: actions.filter((a: any) => a.action_type === 'reminder').length,
    callCount: actions.filter((a: any) => a.action_type === 'call').length,
    promiseCount: promises.length,
    promiseBrokenCount: promises.filter((p) => p.status === 'broken').length,
  }
}

function buildRecommendations(
  caseInfo: CaseInfo,
  metrics: CaseMetrics,
  timeline: TimelineItem[],
): Recommendation | null {
  if (!caseInfo.customer?.phone) {
    return { nextBestAction: 'update_contact', urgency: 'high', reason: 'No phone number on file' }
  }

  if (metrics.promiseBrokenCount >= 2) {
    return { nextBestAction: 'call', urgency: 'high', reason: `${metrics.promiseBrokenCount} promises were broken — direct conversation needed` }
  }

  const readReminder = timeline.find((t) => t.type === 'reminder_read')
  if (readReminder) {
    const hoursSince = (Date.now() - new Date(readReminder.timestamp).getTime()) / 3600000
    if (hoursSince > 48) {
      return { nextBestAction: 'call', urgency: 'high', reason: 'Reminder was read but no payment after 48 hours' }
    }
  }

  if (caseInfo.overdueDays > 30) {
    return { nextBestAction: 'visit', urgency: 'high', reason: `${caseInfo.overdueDays} days overdue — in-person visit recommended` }
  }

  const hasActivePromise = timeline.some(
    (t) => t.type === 'promise_received' && !timeline.some((x) => x.type === 'promise_fulfilled' && x.timestamp > t.timestamp),
  )
  if (hasActivePromise) {
    return { nextBestAction: 'follow_up', urgency: 'medium', reason: 'Pending promise — follow up with customer' }
  }

  if (metrics.reminderCount === 0) {
    return { nextBestAction: 'send_reminder', urgency: 'medium', reason: 'First contact — send a gentle reminder' }
  }

  const last = timeline[0]
  if (!last || (Date.now() - new Date(last.timestamp).getTime()) > 7 * 86400000) {
    return { nextBestAction: 'send_reminder', urgency: 'medium', reason: 'No activity in 7 days — re-engage with a reminder' }
  }

  return null
}

function buildHealth(caseInfo: CaseInfo): CaseHealth {
  return { stale: false, lastUpdated: null }
}

/* ─── Helpers ────────────────────────────────────────────────────────── */

function timelineTitle(type: string, metadata: Record<string, any>): string {
  const m = metadata || {}
  switch (type) {
    case 'call_outcome': {
      const outcome = m.outcome || ''
      const labels: Record<string, string> = {
        promised: 'Promised to pay', no_answer: 'No answer', wrong_number: 'Wrong number',
        dispute: 'Dispute raised', paid: 'Confirmed payment made', not_interested: 'Not interested',
      }
      return labels[outcome] || outcome.replace(/_/g, ' ')
    }
    case 'reminder_sent': return `Reminder sent — ${m.channel || 'WhatsApp'}`
    case 'promise_received': {
      const pd = m.promiseDate ? new Date(m.promiseDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''
      return pd ? `Promised payment by ${pd}` : 'Promised to pay'
    }
    case 'payment_received': {
      const amt = typeof m.amount === 'number' ? `₹${m.amount.toLocaleString('en-IN')}` : ''
      return amt ? `Payment received — ${amt}` : 'Payment received'
    }
    case 'note_added': return `Note: ${m.note || ''}`
    case 'merchant_called': return 'You called'
    case 'case_opened': return 'Recovery started'
    case 'case_closed': return 'Case closed'
    case 'escalated': return 'Case escalated'
    case 'disputed': return 'Invoice disputed'
    case 'customer_viewed': return 'Customer viewed the invoice'
    case 'payment_link_opened': return 'Customer opened the payment link'
    case 'promise_broken': return 'Promise was broken'
    case 'promise_fulfilled': return 'Promise was kept'
    case 'reminder_scheduled': return 'Reminder scheduled'
    case 'reminder_delivered': return 'Reminder delivered'
    case 'reminder_read': return 'Reminder read'
    case 'reminder_failed': return 'Reminder delivery failed'
    case 'payment_failed': return 'Payment attempt failed'
    case 'invoice_created': return 'Invoice created'
    case 'invoice_sent': return 'Invoice sent to customer'
    case 'customer_payment_reported': {
      const amt = typeof m.amount === 'number' ? `₹${m.amount.toLocaleString('en-IN')}` : ''
      return amt ? `Customer reported payment — ${amt}` : 'Customer reported payment'
    }
    case 'payment_confirmed': {
      const amt = typeof m.amount === 'number' ? `₹${m.amount.toLocaleString('en-IN')}` : ''
      return amt ? `Payment confirmed — ${amt}` : 'Payment confirmed'
    }
    default: return type.replace(/_/g, ' ')
  }
}

function severityForType(type: string): string {
  if (['payment_received', 'payment_confirmed', 'promise_fulfilled', 'reminder_delivered', 'reminder_read'].includes(type)) return 'success'
  if (['promise_broken', 'reminder_failed', 'payment_failed', 'disputed'].includes(type)) return 'error'
  if (['call_outcome', 'case_closed'].includes(type)) return 'info'
  return 'neutral'
}
