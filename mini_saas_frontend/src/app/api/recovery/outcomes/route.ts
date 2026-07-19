export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { verifyRequest } from '@/lib/billzo/api-middleware'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import { computeOutcomeAnalytics } from '@/lib/recovery/outcome-analytics'

/**
 * Outcome Analytics — read-only projection over the event store. Returns action
 * outcomes, promise analytics, and communication analytics for a window. No
 * risky attribution ("X recovered ₹Y"); reports "recovered after action".
 * Foundation for the Behavioral Engine.
 */
export async function GET(request: NextRequest) {
  const auth = await verifyRequest(request)
  if (auth.response) return auth.response
  const tenantId = auth.tenantId!
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const windowDays = Math.min(
    90,
    Math.max(7, Number(request.nextUrl.searchParams.get('windowDays')) || 30)
  )
  const since = new Date(Date.now() - windowDays * 86400000).toISOString()

  try {
    const { data: actions } = await supabaseAdmin
      .from('collection_actions')
      .select('id, action_type, status, scheduled_at, completed_at, invoice_ids')
      .eq('tenant_id', tenantId)
      .gte('scheduled_at', since)
      .limit(1000)

    const actionIds = (actions || []).map((a: any) => a.id)

    const { data: events } = actionIds.length
      ? await supabaseAdmin
          .from('collection_action_events')
          .select('action_id, event_type, to_status, created_at, payload')
          .eq('tenant_id', tenantId)
          .in('action_id', actionIds)
          .limit(2000)
      : { data: [] as any[] }

    // Payment events = collection_action_events with event_type payment_received
    const paymentEvents = (events || [])
      .filter((e: any) => e.event_type === 'payment_received')
      .map((e: any) => ({ action_id: e.action_id, created_at: e.created_at, amount: e.payload?.amount }))

    const { data: promises } = await supabaseAdmin
      .from('payment_promises')
      .select('status, promise_date, created_at, paid_at')
      .eq('tenant_id', tenantId)
      .gte('created_at', since)
      .limit(1000)

    const analytics = computeOutcomeAnalytics({
      actions: actions || [],
      events: events || [],
      paymentEvents,
      promises: promises || [],
      windowDays,
    })

    return NextResponse.json({ windowDays, analytics })
  } catch (err: any) {
    console.error('[OutcomeAnalytics] failed', err)
    return NextResponse.json({ error: err?.message ?? 'unknown' }, { status: 500 })
  }
}
