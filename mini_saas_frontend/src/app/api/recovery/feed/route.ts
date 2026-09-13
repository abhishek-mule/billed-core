import { NextRequest, NextResponse } from 'next/server'
import { verifyRequest, errorResponse } from '@/lib/billzo/api-middleware'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'

export const dynamic = 'force-dynamic'

/**
 * GET /api/recovery/feed
 *
 * Recovery Activity — the evidence-driven, tenant-wide feed for the Recovery
 * Command Center. Merges three survivable evidence sources into a single
 * reverse-chronological feed:
 *   - recovery_activities  (append-only merchant-facing log: reminder_sent,
 *                           reminder_delivered/read, promise_received/fulfilled,
 *                           payment_confirmed, call_outcome, etc.)
 *   - inbound whatsapp_events (customer replies to an outbound action)
 *   - payment_promises      (payment promises and their fulfillment)
 *
 * No predictions. Every item is a ground-truth event already recorded.
 */

type FeedCategory = 'payments' | 'recovery' | 'customers' | 'invoices'

type FeedItem = {
  id: string
  type: string
  actor: 'merchant' | 'customer' | 'system'
  title: string
  timestamp: string
  customerId: string | null
  customerName: string | null
  amount: number | null
  detail: string | null
  category: FeedCategory
  invoiceId: string | null
  invoiceNumber: string | null
  invoiceOverdue: number | null
  channel: string | null
  promiseDate: string | null
}

const typeLabel: Record<string, string> = {
  invoice_created: 'Invoice created',
  invoice_sent: 'Invoice sent',
  customer_viewed: 'Customer viewed invoice',
  payment_link_opened: 'Payment link opened',
  reminder_sent: 'Reminder sent',
  reminder_delivered: 'Reminder delivered',
  reminder_read: 'Reminder read',
  reminder_failed: 'Reminder failed',
  reminder_scheduled: 'Reminder scheduled',
  merchant_called: 'Call made',
  call_outcome: 'Call outcome',
  promise_received: 'Promise made',
  promise_fulfilled: 'Promise fulfilled',
  promise_broken: 'Promise broken',
  payment_received: 'Payment received',
  payment_confirmed: 'Payment confirmed',
  payment_failed: 'Payment failed',
  customer_payment_reported: 'Customer reported payment',
  case_opened: 'Case opened',
  case_closed: 'Case closed',
  escalated: 'Escalated',
  disputed: 'Disputed',
  note_added: 'Note added',
  automation_started: 'Recovery started',
  automation_stopped: 'Recovery stopped',
}

const categoryOf: Record<string, FeedCategory> = {
  payment_received: 'payments',
  payment_confirmed: 'payments',
  payment_failed: 'payments',
  customer_payment_reported: 'payments',
  promise_fulfilled: 'payments',
  invoice_created: 'invoices',
  invoice_sent: 'invoices',
  customer_viewed: 'customers',
  payment_link_opened: 'customers',
  'customer.reply': 'customers',
  promise_received: 'recovery',
  promise_broken: 'recovery',
  reminder_scheduled: 'recovery',
  reminder_sent: 'recovery',
  reminder_delivered: 'recovery',
  reminder_read: 'recovery',
  reminder_failed: 'recovery',
  merchant_called: 'recovery',
  call_outcome: 'recovery',
  case_opened: 'recovery',
  case_closed: 'recovery',
  escalated: 'recovery',
  disputed: 'recovery',
  note_added: 'recovery',
  automation_started: 'recovery',
  automation_stopped: 'recovery',
}

const OUTBOUND_STATUS: Record<string, string> = {
  sent: 'reminder_sent',
  delivered: 'reminder_delivered',
  read: 'reminder_read',
  failed: 'reminder_failed',
}

const money = (n: any) => (typeof n === 'number' ? n : n == null ? null : Number(n) || null)

function channelLabel(ch: unknown): string | null {
  if (!ch) return null
  const s = String(ch).toLowerCase()
  if (s.includes('whatsapp') || s === 'wa') return 'WhatsApp'
  if (s.includes('upi')) return 'UPI'
  if (s.includes('email')) return 'Email'
  if (s.includes('sms')) return 'SMS'
  return String(ch)
}

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyRequest(request)
    if (auth.response) return auth.response
    const { tenantId } = auth
    if (!tenantId) return errorResponse('Unauthorized', 401)

    const { searchParams } = new URL(request.url)
    const limitP = parseInt(searchParams.get('limit') || '25', 10)
    const limit = Number.isFinite(limitP) ? Math.min(Math.max(limitP, 1), 100) : 25

    const feed: FeedItem[] = []

    // 1) Append-only merchant activity log
    const { data: activities, error: actErr } = await supabaseAdmin
      .from('recovery_activities')
      .select('id, type, actor, actor_id, customer_id, invoice_id, metadata, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(100)
    if (actErr) return errorResponse(actErr.message, 500)

    // 2) Customer replies (direction=inbound) and outbound delivery/read evidence
    const { data: wa, error: waErr } = await supabaseAdmin
      .from('whatsapp_events')
      .select('id, direction, status, message_preview, customer_id, invoice_id, occurred_at, template, created_at')
      .eq('tenant_id', tenantId)
      .eq('direction', 'inbound')
      .order('created_at', { ascending: false })
      .limit(100)
    if (waErr) return errorResponse(waErr.message, 500)

    // 2b) Outbound reminder lifecycle (sent/delivered/read/failed)
    const { data: waOut, error: waOutErr } = await supabaseAdmin
      .from('whatsapp_events')
      .select('id, status, message_preview, customer_id, invoice_id, occurred_at, created_at')
      .eq('tenant_id', tenantId)
      .eq('direction', 'outbound')
      .in('status', Object.keys(OUTBOUND_STATUS))
      .order('created_at', { ascending: false })
      .limit(100)
    if (waOutErr) return errorResponse(waOutErr.message, 500)

    // 3) Payment promises
    const { data: promises, error: promErr } = await supabaseAdmin
      .from('payment_promises')
      .select('id, customer_id, invoice_id, promise_date, amount, status, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(100)
    if (promErr) return errorResponse(promErr.message, 500)

    const customerIds = [
      ...new Set([
        ...(activities || []).map((a: any) => a.customer_id).filter(Boolean),
        ...(wa || []).map((a: any) => a.customer_id).filter(Boolean),
        ...(waOut || []).map((a: any) => a.customer_id).filter(Boolean),
        ...(promises || []).map((a: any) => a.customer_id).filter(Boolean),
      ]),
    ]
    let custMap = new Map<string, any>()
    if (customerIds.length) {
      const { data: customers } = await supabaseAdmin
        .from('customers')
        .select('id, customer_name')
        .in('id', customerIds)
      custMap = new Map((customers || []).map((c: any) => [c.id, c]))
    }
    const name = (id: string | null) => (id && custMap.get(id)?.customer_name) || null

    const invoiceIds = [
      ...new Set([
        ...(activities || []).map((a: any) => a.invoice_id).filter(Boolean),
        ...(wa || []).map((a: any) => a.invoice_id).filter(Boolean),
        ...(waOut || []).map((a: any) => a.invoice_id).filter(Boolean),
        ...(promises || []).map((a: any) => a.invoice_id).filter(Boolean),
      ]),
    ]
    let invMap = new Map<string, any>()
    if (invoiceIds.length) {
      const { data: invoices, error: invErr } = await supabaseAdmin
        .from('invoices')
        .select('id, invoice_number, total, paid_amount, outstanding_amount, due_date')
        .in('id', invoiceIds)
      if (invErr) return errorResponse(invErr.message, 500)
      invMap = new Map((invoices || []).map((i: any) => [i.id, i]))
    }
    const invoiceOf = (id: string | null) => (id && invMap.get(id)) || null
    const owed = (inv: any) => {
      const v = money(inv?.outstanding_amount)
      return v != null && v > 0 ? v : null
    }

    const activityDetail = (item: any): string | null => {
      const m = item.metadata || {}
      if (item.type === 'merchant_called' || item.type === 'call_outcome') {
        return m.outcome ? String(m.outcome).toLowerCase() === 'completed' ? 'Completed' : String(m.outcome) : null
      }
      return null
    }

    const activityAmount = (item: any, inv: any): number | null => {
      const meta = money(item.metadata?.amount)
      if (meta != null) return meta
      if (item.type.startsWith('reminder') || item.type === 'merchant_called' || item.type === 'call_outcome') return owed(inv)
      if (item.type === 'payment_received' || item.type === 'payment_confirmed' || item.type === 'customer_payment_reported') {
        return money(inv?.total ?? null)
      }
      return null
    }

    for (const a of activities || []) {
      const inv = invoiceOf(a.invoice_id)
      const ch = channelLabel(a.metadata?.channel)
      feed.push({
        id: a.id,
        type: a.type,
        actor: a.actor === 'customer' ? 'customer' : a.actor === 'system' ? 'system' : 'merchant',
        title: typeLabel[a.type] || (a.type || 'event').replace(/_/g, ' '),
        timestamp: a.created_at,
        customerId: a.customer_id || null,
        customerName: name(a.customer_id),
        amount: activityAmount(a, inv),
        detail: activityDetail(a),
        category: categoryOf[a.type] || 'recovery',
        invoiceId: a.invoice_id || null,
        invoiceNumber: inv?.invoice_number || null,
        invoiceOverdue: a.type.startsWith('reminder') ? owed(inv) : null,
        channel: ch ?? (a.type.startsWith('reminder') ? 'WhatsApp' : null),
        promiseDate: null,
      })
    }

    for (const w of wa || []) {
      const inv = invoiceOf(w.invoice_id)
      feed.push({
        id: w.id,
        type: 'customer.reply',
        actor: 'customer',
        title: 'Customer replied',
        timestamp: w.occurred_at || w.created_at,
        customerId: w.customer_id || null,
        customerName: name(w.customer_id),
        amount: null,
        detail: w.message_preview || null,
        category: 'customers',
        invoiceId: w.invoice_id || null,
        invoiceNumber: inv?.invoice_number || null,
        invoiceOverdue: null,
        channel: 'WhatsApp',
        promiseDate: null,
      })
    }

    for (const w of waOut || []) {
      const inv = invoiceOf(w.invoice_id)
      const evType = OUTBOUND_STATUS[w.status]
      const isFailure = evType === 'reminder_failed'
      feed.push({
        id: `wa_${w.id}`,
        type: evType,
        actor: 'system',
        title: typeLabel[evType] || evType,
        timestamp: w.occurred_at || w.created_at,
        customerId: w.customer_id || null,
        customerName: name(w.customer_id),
        amount: isFailure ? null : owed(inv),
        detail: isFailure ? 'Delivery failed' : null,
        category: 'recovery',
        invoiceId: w.invoice_id || null,
        invoiceNumber: inv?.invoice_number || null,
        invoiceOverdue: owed(inv),
        channel: 'WhatsApp',
        promiseDate: null,
      })
    }

    for (const p of promises || []) {
      const inv = invoiceOf(p.invoice_id)
      const summary =
        p.status === 'fulfilled' ? 'Promise fulfilled' : p.status === 'broken' ? 'Promise broken' : 'Promise made'
      feed.push({
        id: `promise_${p.id}`,
        type: p.status === 'fulfilled' ? 'promise_fulfilled' : p.status === 'broken' ? 'promise_broken' : 'promise_received',
        actor: 'customer',
        title: summary,
        timestamp: p.created_at,
        customerId: p.customer_id || null,
        customerName: name(p.customer_id),
        amount: money(p.amount),
        detail: p.promise_date
          ? `promised for ${new Date(p.promise_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
          : null,
        category: p.status === 'fulfilled' ? 'payments' : 'recovery',
        invoiceId: p.invoice_id || null,
        invoiceNumber: inv?.invoice_number || null,
        invoiceOverdue: p.status === 'broken' ? owed(inv) : null,
        channel: null,
        promiseDate: p.promise_date || null,
      })
    }

    feed.sort((a, b) => +new Date(b.timestamp) - +new Date(a.timestamp))

    return NextResponse.json({ feed: feed.slice(0, limit), total: feed.length })
  } catch (err: any) {
    return errorResponse(err.message, 500)
  }
}