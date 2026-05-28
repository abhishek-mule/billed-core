import { supabaseAdmin } from '@/lib/billzo/supabase-admin'

export const dynamic = 'force-dynamic'

interface TimelineEvent {
  id: string
  type: string
  timestamp: string
  source: string
  payload: Record<string, unknown>
  causationId?: string | null
  correlationId?: string
  delta?: { field: string; before: unknown; after: unknown }[]
  eventSequence?: number
}

interface PageProps {
  params: Promise<{ identifier: string }>
  searchParams: Promise<{ type?: string; from?: string; to?: string }>
}

async function fetchTimeline(identifier: string, type: string): Promise<{ events: TimelineEvent[]; metadata: any }> {
  const fetchers: Promise<any[]>[] = []

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
          delta: [{ field: 'transport_state', before: row.prev_transport_state, after: row.transport_state }],
        })))
    )
    const invoiceIds = await supabaseAdmin.from('invoices').select('id').eq('customer_id', identifier).then(r => r.data?.map(i => i.id) || [])
    fetchers.push(
      supabaseAdmin.from('recovery_attributions').select('*').in('invoice_id', invoiceIds).order('created_at', { ascending: true })
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
          delta: [{ field: 'transport_state', before: row.prev_transport_state, after: row.transport_state }],
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

  const seen = new Set<string>()
  allEvents = allEvents.filter(e => {
    const key = `${e.source}:${e.id}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  const sourceOrder: Record<string, number> = { transport: 0, orchestration: 1, behavior: 2, attribution: 3, system: 4 }
  allEvents.sort((a, b) => {
    const ts = a.timestamp.localeCompare(b.timestamp)
    if (ts !== 0) return ts
    return (sourceOrder[a.source] ?? 5) - (sourceOrder[b.source] ?? 5)
  })

  return {
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
  }
}

function SourceBadge({ source }: { source: string }) {
  const colors: Record<string, string> = {
    transport: '#4CAF50',
    orchestration: '#2196F3',
    behavior: '#FF9800',
    attribution: '#9C27B0',
    system: '#607D8B',
  }
  return <span style={{ background: colors[source] || '#999', color: '#fff', padding: '1px 6px', borderRadius: 3, fontSize: 11, fontWeight: 600 }}>{source}</span>
}

export default async function RecoveryTimelinePage(props: PageProps) {
  const params = await props.params
  const searchParams = await props.searchParams
  const identifier = params.identifier
  const type = searchParams.type || 'invoice'

  let data: { events: TimelineEvent[]; metadata: any } | null = null
  let error: string | null = null

  try {
    data = await fetchTimeline(identifier, type)
  } catch (e: any) {
    error = e.message
  }

  return (
    <html>
      <head>
        <title>Recovery Timeline — {identifier}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body style={{ fontFamily: 'monospace', fontSize: 13, margin: 0, padding: 16, background: '#1a1a2e', color: '#e0e0e0' }}>
        <h1 style={{ fontSize: 18, margin: '0 0 16px 0' }}>Recovery Timeline</h1>

        <div style={{ marginBottom: 16 }}>
          <label style={{ marginRight: 8 }}>Entity:</label>
          <code style={{ background: '#16213e', padding: '2px 8px', borderRadius: 3 }}>{identifier}</code>
          <span style={{ margin: '0 12px' }}>|</span>
          <label style={{ marginRight: 8 }}>Type:</label>
          <span style={{ background: '#16213e', padding: '2px 8px', borderRadius: 3 }}>{type}</span>
        </div>

        {error && (
          <div style={{ color: '#ff6b6b', padding: 12, background: '#2d1b1b', borderRadius: 4, marginBottom: 16 }}>
            Error: {error}
          </div>
        )}

        {data && (
          <>
            <div style={{ marginBottom: 12, fontSize: 12, color: '#888' }}>
              {data.metadata.totalEvents} events | Transport: {data.metadata.sources.transport} | Orchestration: {data.metadata.sources.orchestration} | Behavior: {data.metadata.sources.behavior} | Attribution: {data.metadata.sources.attribution} | System: {data.metadata.sources.system}
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <a href={`/internal/recovery/${identifier}?type=invoice`} style={{ ...linkStyle, fontWeight: type === 'invoice' ? 700 : 400 }}>Invoice</a>
              <a href={`/internal/recovery/${identifier}?type=customer`} style={{ ...linkStyle, fontWeight: type === 'customer' ? 700 : 400 }}>Customer</a>
            </div>

            <div style={{ border: '1px solid #333', borderRadius: 4 }}>
              {data.events.length === 0 && (
                <div style={{ padding: 24, textAlign: 'center', color: '#666' }}>No events found</div>
              )}
              {data.events.map((event) => (
                <TimelineRow key={`${event.source}:${event.id}`} event={event} />
              ))}
            </div>

            <div style={{ marginTop: 24, fontSize: 11, color: '#555' }}>
              <h3 style={{ fontSize: 13, margin: '0 0 8px 0', color: '#888' }}>Graph Export</h3>
              <button onClick="copyGraph()" style={{ background: '#16213e', color: '#888', border: '1px solid #333', padding: '4px 12px', borderRadius: 3, cursor: 'pointer' }}>
                Copy JSON
              </button>
              <pre id="graph-data" style={{ display: 'none' }}>{JSON.stringify({ nodes: data.events, edges: [] }, null, 2)}</pre>
              <script dangerouslySetInnerHTML={{
                __html: `
                  window.copyGraph = function() {
                    const el = document.getElementById('graph-data');
                    navigator.clipboard.writeText(el.textContent);
                  }
                `
              }} />
            </div>
          </>
        )}
      </body>
    </html>
  )
}

function TimelineRow({ event }: { event: TimelineEvent }) {
  const payloadStr = JSON.stringify(event.payload, null, 2)
  const isExpandable = payloadStr.length > 2

  return (
    <details style={{ borderBottom: '1px solid #2a2a3e' }}>
      <summary style={{ padding: '6px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, userSelect: 'none' }}>
        <span style={{ color: '#888', fontSize: 11, minWidth: 140 }}>{event.timestamp?.slice(0, 19) || '—'}</span>
        <SourceBadge source={event.source} />
        <span style={{ color: event.type.startsWith('transport.failed') ? '#ff6b6b' : '#e0e0e0', flex: 1 }}>{event.type}</span>
        {event.causationId && <span style={{ fontSize: 10, color: '#666' }}>caused by: {event.causationId.slice(0, 16)}…</span>}
        {event.correlationId && <span style={{ fontSize: 10, color: '#555' }}>corr: {event.correlationId.slice(0, 16)}…</span>}
      </summary>
      <div style={{ padding: '0 12px 8px 12px', background: '#12122a' }}>
        {event.delta && event.delta.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            {event.delta.map((d, i) => (
              <div key={i} style={{ fontSize: 11, color: '#aaa' }}>
                {d.field}: <span style={{ color: '#ff6b6b' }}>{JSON.stringify(d.before)}</span> → <span style={{ color: '#4CAF50' }}>{JSON.stringify(d.after)}</span>
              </div>
            ))}
          </div>
        )}
        <pre style={{ fontSize: 11, color: '#aaa', margin: 0, whiteSpace: 'pre-wrap', maxHeight: 200, overflow: 'auto' }}>
          {payloadStr}
        </pre>
      </div>
    </details>
  )
}

const linkStyle: React.CSSProperties = {
  color: '#64b5f6',
  textDecoration: 'none',
  padding: '2px 8px',
  borderRadius: 3,
  fontSize: 12,
}
