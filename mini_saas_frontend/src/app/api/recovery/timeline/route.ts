export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { verifyRequest } from '@/lib/billzo/api-middleware'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'

/**
 * Customer Timeline — unified, append-only event history for one customer.
 * Sources: collection_actions (lifecycle), collection_action_events (state
 * changes), whatsapp_events (delivery/read). The single audit + debug trail a
 * merchant or support agent scrolls to answer "why didn't they pay?".
 */
export async function GET(request: NextRequest) {
  const auth = await verifyRequest(request)
  if (auth.response) return auth.response
  const tenantId = auth.tenantId!
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const customerId = request.nextUrl.searchParams.get('customerId')
  if (!customerId) return NextResponse.json({ error: 'customerId required' }, { status: 400 })

  try {
    const { data: actions } = await supabaseAdmin
      .from('collection_actions')
      .select('id, action_type, channel, template_name, status, trigger_type, created_at, scheduled_at, completed_at, invoice_ids')
      .eq('tenant_id', tenantId)
      .eq('customer_id', customerId)
      .order('created_at', { ascending: true })
      .limit(200)

    const actionIds = (actions || []).map((a: any) => a.id)

    const { data: events } = actionIds.length
      ? await supabaseAdmin
          .from('collection_action_events')
          .select('action_id, event_type, to_status, created_at, payload')
          .eq('tenant_id', tenantId)
          .in('action_id', actionIds)
          .order('created_at', { ascending: true })
          .limit(400)
      : { data: [] as any[] }

    const { data: wa } = actionIds.length
      ? await supabaseAdmin
          .from('whatsapp_events')
          .select('recovery_attempt_id, template, delivered_at, read_at, clicked_at, failed_reason, occurred_at, status')
          .eq('tenant_id', tenantId)
          .in('recovery_attempt_id', actionIds)
          .order('occurred_at', { ascending: true })
          .limit(400)
      : { data: [] as any[] }

    const unified: any[] = []

    // 1. collection_actions itself: created/scheduled/completed milestones
    for (const a of actions || []) {
      const label = a.action_type === 'call' ? 'Phone Call' : a.action_type === 'reminder' ? 'Reminder' : a.action_type === 'promise_followup' ? 'Promise Follow-up' : a.action_type
      if (a.created_at) unified.push({ at: a.created_at, source: 'action', type: 'created', label: `${label} Scheduled`, detail: a.channel || a.template_name || '' })
      if (a.completed_at) unified.push({ at: a.completed_at, source: 'action', type: 'completed', label: `${label} Completed`, detail: '' })
    }

    // 2. collection_action_events: state transitions
    const evtLabel: Record<string, string> = {
      scheduled: 'Scheduled', started: 'Started', sent: 'Reminder Sent', delivered: 'Delivered',
      failed: 'Failed', completed: 'Completed', cancelled: 'Cancelled', expired: 'Expired',
      promise_made: 'Promise Made', payment_received: 'Payment Received', state_changed: 'Case State Changed',
    }
    for (const e of events || []) {
      unified.push({
        at: e.created_at, source: 'event', type: e.event_type,
        label: evtLabel[e.event_type] || e.event_type.replace(/_/g, ' '),
        detail: e.payload?.reason || e.payload?.channel || (e.to_status ? `→ ${e.to_status}` : '') || '',
      })
    }

    // 3. whatsapp_events: delivery signal
    for (const w of wa || []) {
      if (w.delivered_at) unified.push({ at: w.delivered_at, source: 'whatsapp', type: 'delivered', label: 'Delivered', detail: w.template || '' })
      if (w.read_at) unified.push({ at: w.read_at, source: 'whatsapp', type: 'read', label: 'Read', detail: w.template || '' })
      if (w.clicked_at) unified.push({ at: w.clicked_at, source: 'whatsapp', type: 'clicked', label: 'Clicked UPI', detail: '' })
      if (w.status === 'failed' && !w.delivered_at) unified.push({ at: w.occurred_at, source: 'whatsapp', type: 'failed', label: 'Delivery Failed', detail: w.failed_reason || '' })
    }

    unified.sort((x, y) => +new Date(x.at) - +new Date(y.at))

    // Group by day
    const byDay = new Map<string, any[]>()
    for (const u of unified) {
      const d = new Date(u.at).toISOString().slice(0, 10)
      const arr = byDay.get(d) || []
      arr.push(u)
      byDay.set(d, arr)
    }
    const days = [...byDay.entries()].map(([date, items]) => ({ date, items })).reverse()

    return NextResponse.json({ customerId, days, total: unified.length })
  } catch (err: any) {
    console.error('[Timeline] failed', err)
    return NextResponse.json({ error: err?.message ?? 'unknown' }, { status: 500 })
  }
}
