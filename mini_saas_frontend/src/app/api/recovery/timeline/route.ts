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
  const caseId = request.nextUrl.searchParams.get('caseId')

  if (!customerId && !caseId) return NextResponse.json({ error: 'customerId or caseId required' }, { status: 400 })

  try {
    // Case-scoped: return recovery_activities for the case
    if (caseId) {
      const { data: activities, error } = await supabaseAdmin
        .from('recovery_activities')
        .select('id, customer_id, invoice_id, type, actor, metadata, created_at')
        .eq('tenant_id', tenantId)
        .eq('case_id', caseId)
        .order('created_at', { ascending: true })
        .limit(100)

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      const events = (activities || []).map((a: any) => ({
        id: a.id,
        type: a.type,
        title: storyLineFromActivity(a.type, a.metadata),
        description: a.metadata?.note || '',
        timestamp: a.created_at,
        source: a.actor === 'merchant' ? 'merchant' : a.actor === 'system' ? 'system' : 'customer',
        severity: severityForType(a.type),
        metadata: a.metadata || {},
      }))

      const byDay = groupByDay(events)
      return NextResponse.json({ caseId, days: byDay, total: events.length })
    }

    // Customer-scoped (legacy path): merge collection_actions + collection_action_events + whatsapp_events
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

    for (const a of actions || []) {
      const label = a.action_type === 'call' ? 'Phone Call' : a.action_type === 'reminder' ? 'Reminder' : a.action_type === 'promise_followup' ? 'Promise Follow-up' : a.action_type
      if (a.created_at) unified.push({ at: a.created_at, source: 'action', type: 'created', label: `${label} Scheduled`, detail: a.channel || a.template_name || '' })
      if (a.completed_at) unified.push({ at: a.completed_at, source: 'action', type: 'completed', label: `${label} Completed`, detail: '' })
    }

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

    for (const w of wa || []) {
      if (w.delivered_at) unified.push({ at: w.delivered_at, source: 'whatsapp', type: 'delivered', label: 'Delivered', detail: w.template || '' })
      if (w.read_at) unified.push({ at: w.read_at, source: 'whatsapp', type: 'read', label: 'Read', detail: w.template || '' })
      if (w.clicked_at) unified.push({ at: w.clicked_at, source: 'whatsapp', type: 'clicked', label: 'Clicked UPI', detail: '' })
      if (w.status === 'failed' && !w.delivered_at) unified.push({ at: w.occurred_at, source: 'whatsapp', type: 'failed', label: 'Delivery Failed', detail: w.failed_reason || '' })
    }

    unified.sort((x, y) => +new Date(x.at) - +new Date(y.at))

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

function storyLineFromActivity(type: string, metadata: Record<string, any>): string {
  const m = metadata || {}
  switch (type) {
    case 'call_outcome': {
      const outcome = m.outcome || ''
      const labels: Record<string, string> = {
        promised: 'Promised to pay',
        no_answer: 'No answer',
        wrong_number: 'Wrong number',
        dispute: 'Dispute raised',
        paid: 'Confirmed payment made',
        not_interested: 'Not interested',
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
    case 'invoice_created': return 'Invoice created'
    case 'invoice_sent': return 'Invoice sent to customer'
    case 'customer_viewed': return 'Customer viewed the invoice'
    case 'payment_link_opened': return 'Customer opened the payment link'
    case 'promise_broken': return 'Promise was broken'
    case 'promise_fulfilled': return 'Promise was kept'
    case 'customer_payment_reported': {
      const amt = typeof m.amount === 'number' ? `₹${m.amount.toLocaleString('en-IN')}` : ''
      return amt ? `Customer reported payment — ${amt}` : 'Customer reported payment'
    }
    case 'payment_confirmed': {
      const amt = typeof m.amount === 'number' ? `₹${m.amount.toLocaleString('en-IN')}` : ''
      return amt ? `Payment confirmed — ${amt}` : 'Payment confirmed'
    }
    case 'case_opened': return 'Recovery started'
    case 'case_closed': return 'Case closed'
    case 'escalated': return 'Case escalated'
    case 'disputed': return 'Invoice disputed'
    case 'reminder_scheduled': return 'Reminder scheduled'
    case 'reminder_delivered': return 'Reminder delivered'
    case 'reminder_read': return 'Reminder read'
    case 'reminder_failed': return 'Reminder delivery failed'
    case 'payment_failed': return 'Payment attempt failed'
    default: return type.replace(/_/g, ' ')
  }
}

function severityForType(type: string): string {
  if (type === 'payment_received' || type === 'payment_confirmed' || type === 'promise_fulfilled' || type === 'reminder_delivered' || type === 'reminder_read') return 'success'
  if (type === 'promise_broken' || type === 'reminder_failed' || type === 'payment_failed' || type === 'disputed') return 'error'
  if (type === 'call_outcome' || type === 'case_closed') return 'info'
  return 'neutral'
}

function groupByDay(events: any[]): { date: string; items: any[] }[] {
  const byDay = new Map<string, any[]>()
  for (const e of events) {
    const d = new Date(e.timestamp).toISOString().slice(0, 10)
    const arr = byDay.get(d) || []
    arr.push(e)
    byDay.set(d, arr)
  }
  return [...byDay.entries()].map(([date, items]) => ({ date, items })).reverse()
}
