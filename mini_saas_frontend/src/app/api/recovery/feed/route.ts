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
  promise_received: 'Promise received',
  promise_fulfilled: 'Promise fulfilled',
  promise_broken: 'Promise broken',
  payment_received: 'Payment received',
  payment_confirmed: 'Payment confirmed',
  case_opened: 'Case opened',
  case_closed: 'Case closed',
  escalated: 'Escalated',
  disputed: 'Disputed',
  note_added: 'Note added',
  'customer.payment_reported': 'Customer reported payment',
}

const money = (n: any) => (typeof n === 'number' ? n : n == null ? null : Number(n) || null)

function activityDetail(item: any): string | null {
  const m = item.metadata || {}
  if (item.type === 'payment_confirmed' || item.type === 'payment_received') return null
  if (m.channel) return `via ${m.channel}`
  if (m.amount != null) return null
  return null
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
      .select('id, type, actor, actor_id, customer_id, metadata, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(100)
    if (actErr) return errorResponse(actErr.message, 500)

    // 2) Customer replies (direction=inbound) and outbound delivery/read evidence
    const { data: wa, error: waErr } = await supabaseAdmin
      .from('whatsapp_events')
      .select('id, direction, status, message_preview, customer_id, occurred_at, template, created_at')
      .eq('tenant_id', tenantId)
      .eq('direction', 'inbound')
      .order('created_at', { ascending: false })
      .limit(100)
    if (waErr) return errorResponse(waErr.message, 500)

    // 3) Payment promises
    const { data: promises, error: promErr } = await supabaseAdmin
      .from('payment_promises')
      .select('id, customer_id, promise_date, promise_amount, status, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(100)
    if (promErr) return errorResponse(promErr.message, 500)

    const customerIds = [
      ...new Set([
        ...(activities || []).map((a: any) => a.customer_id).filter(Boolean),
        ...(wa || []).map((a: any) => a.customer_id).filter(Boolean),
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

    for (const a of activities || []) {
      feed.push({
        id: a.id,
        type: a.type,
        actor: a.actor === 'customer' ? 'customer' : a.actor === 'system' ? 'system' : 'merchant',
        title: typeLabel[a.type] || (a.type || 'event').replace(/_/g, ' '),
        timestamp: a.created_at,
        customerId: a.customer_id || null,
        customerName: name(a.customer_id),
        amount: null,
        detail: activityDetail(a),
      })
    }

    for (const w of wa || []) {
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
      })
    }

    for (const p of promises || []) {
      const statusLabel =
        p.status === 'fulfilled' ? 'Promise fulfilled' : p.status === 'broken' ? 'Promise broken' : 'Promise received'
      feed.push({
        id: `promise_${p.id}`,
        type: p.status === 'fulfilled' ? 'promise_fulfilled' : p.status === 'broken' ? 'promise_broken' : 'promise_received',
        actor: 'customer',
        title: statusLabel,
        timestamp: p.created_at,
        customerId: p.customer_id || null,
        customerName: name(p.customer_id),
        amount: money(p.promise_amount),
        detail: p.promise_date ? `by ${new Date(p.promise_date).toLocaleDateString()}` : null,
      })
    }

    feed.sort((a, b) => +new Date(b.timestamp) - +new Date(a.timestamp))

    return NextResponse.json({ feed: feed.slice(0, limit), total: feed.length })
  } catch (err: any) {
    return errorResponse(err.message, 500)
  }
}
