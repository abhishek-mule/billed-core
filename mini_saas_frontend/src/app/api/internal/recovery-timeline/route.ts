import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'

export const dynamic = 'force-dynamic'

const INTERNAL_KEY = process.env.INTERNAL_API_KEY || 'dev-internal-key'

async function verifyInternal(request: NextRequest): Promise<boolean> {
  const key = request.headers.get('x-internal-key')
  if (key === INTERNAL_KEY) return true
  if (process.env.NODE_ENV !== 'production') return true
  return false
}

export async function GET(request: NextRequest) {
  try {
    if (!(await verifyInternal(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const identifier = searchParams.get('identifier')
    const type = searchParams.get('type') || 'invoice'
    const from = searchParams.get('from')
    const to = searchParams.get('to')

    if (!identifier) {
      return NextResponse.json({ error: 'identifier required' }, { status: 400 })
    }

    // Fetch from all sources in parallel
    const fetchers: Promise<any[]>[] = []

    // 1. whatsapp_events
    if (type === 'customer') {
      fetchers.push(
        supabaseAdmin.from('whatsapp_events').select('*').eq('customer_id', identifier).order('event_sequence', { ascending: true }).limit(500)
          .then(r => (r.data || []).map((row: any) => ({
            id: row.billzo_message_id || row.id,
            type: `transport.${row.status || 'unknown'}`,
            timestamp: row.occurred_at || row.created_at,
            source: 'transport',
            payload: row,
            eventSequence: row.event_sequence ? Number(row.event_sequence) : undefined,
          })))
      )
      fetchers.push(
        supabaseAdmin.from('outbox').select('*').eq('entity_id', identifier).order('created_at', { ascending: true }).limit(500)
          .then(r => (r.data || []).map((row: any) => ({
            id: row.id,
            type: row.type,
            timestamp: row.created_at,
            source: row.type?.startsWith('orchestration.') ? 'orchestration' : 'system',
            payload: row.payload || {},
            causationId: row.causation_id || null,
            correlationId: row.correlation_id || '',
          })))
      )
      fetchers.push(
        supabaseAdmin.from('projection_delta_log').select('*').eq('customer_id', identifier).order('occurred_at', { ascending: true }).limit(500)
          .then(r => (r.data || []).map((row: any) => ({
            id: `proj_${row.id}`,
            type: 'projection.delta',
            timestamp: row.occurred_at,
            source: 'system',
            payload: row,
            delta: [
              { field: 'transport_state', before: row.prev_transport_state, after: row.transport_state },
            ],
          })))
      )
      fetchers.push(
        supabaseAdmin.from('customer_behavioral_metrics').select('*').eq('customer_id', identifier).maybeSingle()
          .then(r => r.data ? [{
            id: `behavioral_${r.data.customer_id}_${r.data.updatedAt}`,
            type: 'behavioral.snapshot',
            timestamp: r.data.updatedAt,
            source: 'behavior',
            payload: r.data,
          }] : [])
      )
      fetchers.push(
        supabaseAdmin.from('recovery_attributions').select('*').in('invoice_id',
          supabaseAdmin.from('invoices').select('id').eq('customer_id', identifier).then(r => r.data?.map(i => i.id) || [])
        ).order('created_at', { ascending: true })
          .then(r => (r.data || []).map((row: any) => ({
            id: `attr_${row.id}`,
            type: 'attribution.assigned',
            timestamp: row.created_at,
            source: 'attribution',
            payload: row,
            causationId: row.reminder_event_id || null,
            correlationId: row.reminder_event_id || '',
          })))
      )
    } else {
      // invoice / message / case — query by entity_id
      fetchers.push(
        supabaseAdmin.from('whatsapp_events').select('*').eq('invoice_id', identifier).order('event_sequence', { ascending: true }).limit(500)
          .then(r => (r.data || []).map((row: any) => ({
            id: row.billzo_message_id || row.id,
            type: `transport.${row.status || 'unknown'}`,
            timestamp: row.occurred_at || row.created_at,
            source: 'transport',
            payload: row,
            eventSequence: row.event_sequence ? Number(row.event_sequence) : undefined,
          })))
      )
      fetchers.push(
        supabaseAdmin.from('outbox').select('*').eq('entity_id', identifier).order('created_at', { ascending: true }).limit(500)
          .then(r => (r.data || []).map((row: any) => ({
            id: row.id,
            type: row.type,
            timestamp: row.created_at,
            source: row.type?.startsWith('orchestration.') ? 'orchestration' : 'system',
            payload: row.payload || {},
            causationId: row.causation_id || null,
            correlationId: row.correlation_id || '',
          })))
      )
      fetchers.push(
        supabaseAdmin.from('projection_delta_log').select('*').eq('invoice_id', identifier).order('occurred_at', { ascending: true }).limit(500)
          .then(r => (r.data || []).map((row: any) => ({
            id: `proj_${row.id}`,
            type: 'projection.delta',
            timestamp: row.occurred_at,
            source: 'system',
            payload: row,
            delta: [
              { field: 'transport_state', before: row.prev_transport_state, after: row.transport_state },
            ],
          })))
      )
      fetchers.push(
        supabaseAdmin.from('recovery_attributions').select('*').eq('invoice_id', identifier).order('created_at', { ascending: true }).limit(100)
          .then(r => (r.data || []).map((row: any) => ({
            id: `attr_${row.id}`,
            type: 'attribution.assigned',
            timestamp: row.created_at,
            source: 'attribution',
            payload: row,
            causationId: row.reminder_event_id || null,
            correlationId: row.reminder_event_id || '',
          })))
      )
    }

    const results = await Promise.all(fetchers)
    let allEvents = results.flat()

    // Apply time filters
    if (from) {
      allEvents = allEvents.filter(e => e.timestamp >= from)
    }
    if (to) {
      allEvents = allEvents.filter(e => e.timestamp <= to)
    }

    // Deduplicate by (source, id)
    const seen = new Set<string>()
    allEvents = allEvents.filter(e => {
      const key = `${e.source}:${e.id}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    // Sort by timestamp, fall back to source priority for ties
    const sourceOrder: Record<string, number> = { transport: 0, orchestration: 1, behavior: 2, attribution: 3, system: 4 }
    allEvents.sort((a, b) => {
      const ts = a.timestamp.localeCompare(b.timestamp)
      if (ts !== 0) return ts
      return (sourceOrder[a.source] ?? 5) - (sourceOrder[b.source] ?? 5)
    })

    return NextResponse.json({
      events: allEvents,
      metadata: {
        totalEvents: allEvents.length,
        sources: {
          transport: allEvents.filter(e => e.source === 'transport').length,
          orchestration: allEvents.filter(e => e.source === 'orchestration').length,
          behavior: allEvents.filter(e => e.source === 'behavior').length,
          attribution: allEvents.filter(e => e.source === 'attribution').length,
          system: allEvents.filter(e => e.source === 'system').length,
        },
      },
    })
  } catch (err: any) {
    console.error('[InternalRecoveryTimeline] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
