import { supabaseAdmin } from '@/lib/billzo/supabase-admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface MetricCard {
  label: string
  value: string | number
  good?: boolean
  warn?: boolean
  bad?: boolean
}

function MetricCard({ label, value, good, warn, bad }: MetricCard) {
  const color = good ? 'text-green-600' : warn ? 'text-yellow-600' : bad ? 'text-red-600' : 'text-gray-900'
  return (
    <div className="bg-white rounded-lg border p-4">
      <div className="text-sm text-gray-500 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
    </div>
  )
}

export default async function AdminMessagingPage() {
  const now = new Date().toISOString()
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  // Parallel queries
  const [
    outboxPendingRes,
    deadLetterRes,
    todayEventsRes,
    totalEventsRes,
    lastEventRes,
    lastHeartbeatRes,
  ] = await Promise.all([
    supabaseAdmin
      .from('outbox')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending'),
    supabaseAdmin
      .from('dead_letter_events')
      .select('id', { count: 'exact', head: true })
      .is('resolved_at', null),
    supabaseAdmin
      .from('whatsapp_events')
      .select('id, status', { count: 'exact', head: false })
      .gte('created_at', todayStart.toISOString()),
    supabaseAdmin
      .from('whatsapp_events')
      .select('id', { count: 'exact', head: true }),
    supabaseAdmin
      .from('whatsapp_events')
      .select('id, status, provider_message_id, billzo_message_id, occurred_at, created_at, phone')
      .order('created_at', { ascending: false })
      .limit(10),
    supabaseAdmin
      .from('dead_letter_events')
      .select('id, reason, received_at, retry_count')
      .is('resolved_at', null)
      .order('received_at', { ascending: false })
      .limit(5),
  ])

  const outboxPending = outboxPendingRes.count ?? 0
  const deadLetterCount = deadLetterRes.count ?? 0
  const totalEvents = totalEventsRes.count ?? 0

  // Compute today's stats
  const todayEvents = todayEventsRes.data ?? []
  const todayTotal = todayEvents.length
  const todayDelivered = todayEvents.filter(e => e.status === 'delivered').length
  const todayRead = todayEvents.filter(e => e.status === 'read').length
  const todayFailed = todayEvents.filter(e => e.status === 'failed').length
  const todaySent = todayEvents.filter(e => e.status === 'sent').length

  const deliveredPct = todayTotal > 0 ? ((todayDelivered / todayTotal) * 100).toFixed(1) : '—'
  const readPct = todayTotal > 0 ? ((todayRead / todayTotal) * 100).toFixed(1) : '—'
  const failedPct = todayTotal > 0 ? ((todayFailed / todayTotal) * 100).toFixed(1) : '—'

  const lastEvent = lastEventRes.data?.[0] ?? null
  const deadLetters = lastHeartbeatRes.data ?? []

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Messaging Infrastructure</h1>
            <p className="text-sm text-gray-500 mt-1">
              BillZo v0.4 — message.event pipeline diagnostics
            </p>
          </div>
          <div className="text-xs text-gray-400 font-mono">
            as of {now}
          </div>
        </div>

        {/* Pipeline health */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <MetricCard
            label="Queue Backlog"
            value={outboxPending}
            good={outboxPending === 0}
            warn={outboxPending > 0 && outboxPending < 50}
            bad={outboxPending >= 50}
          />
          <MetricCard
            label="Dead Letters"
            value={deadLetterCount}
            good={deadLetterCount === 0}
            warn={deadLetterCount > 0 && deadLetterCount < 10}
            bad={deadLetterCount >= 10}
          />
          <MetricCard
            label="Total Events (Lifetime)"
            value={totalEvents.toLocaleString()}
          />
          <MetricCard
            label="Events Today"
            value={todayTotal}
          />
        </div>

        {/* Today's delivery metrics */}
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Today&apos;s Delivery Metrics</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          <MetricCard label="Sent" value={todaySent} />
          <MetricCard label="Delivered" value={todayDelivered} />
          <MetricCard label="Read" value={todayRead} />
          <MetricCard label="Failed" value={todayFailed} bad={todayFailed > 0} />
          <MetricCard
            label="Delivered %"
            value={`${deliveredPct}%`}
            good={typeof deliveredPct === 'number' && Number(deliveredPct) >= 80}
            warn={typeof deliveredPct === 'number' && Number(deliveredPct) >= 50 && Number(deliveredPct) < 80}
            bad={typeof deliveredPct === 'number' && Number(deliveredPct) < 50}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Latest events */}
          <div className="bg-white rounded-lg border">
            <div className="px-4 py-3 border-b font-semibold text-gray-900 text-sm">
              Recent Events (last 10)
            </div>
            <div className="divide-y max-h-80 overflow-y-auto">
              {lastEvent ? (
                lastEventRes.data?.map((e: any) => (
                  <div key={e.id} className="px-4 py-2.5 text-xs font-mono">
                    <div className="flex items-center gap-2">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${
                        e.status === 'delivered' ? 'bg-green-100 text-green-700' :
                        e.status === 'read' ? 'bg-blue-100 text-blue-700' :
                        e.status === 'failed' ? 'bg-red-100 text-red-700' :
                        e.status === 'sent' ? 'bg-gray-100 text-gray-700' :
                        'bg-gray-100 text-gray-500'
                      }`}>
                        {e.status}
                      </span>
                      <span className="text-gray-400 truncate flex-1">
                        {e.billzo_message_id || e.provider_message_id || e.id?.slice(0, 12)}
                      </span>
                      <span className="text-gray-400">{e.phone}</span>
                    </div>
                    <div className="text-gray-400 mt-0.5">
                      {new Date(e.created_at).toLocaleString()}
                    </div>
                  </div>
                ))
              ) : (
                <div className="px-4 py-8 text-center text-gray-400 text-sm">
                  No events yet
                </div>
              )}
            </div>
          </div>

          {/* Dead letter queue */}
          <div className="bg-white rounded-lg border">
            <div className="px-4 py-3 border-b font-semibold text-gray-900 text-sm flex items-center justify-between">
              <span>Dead Letter Queue</span>
              {deadLetterCount > 0 && (
                <span className="text-red-600 text-xs font-normal">
                  {deadLetterCount} unresolved
                </span>
              )}
            </div>
            <div className="divide-y max-h-80 overflow-y-auto">
              {deadLetters.length > 0 ? (
                deadLetters.map((dl: any) => (
                  <div key={dl.id} className="px-4 py-2.5 text-xs font-mono">
                    <div className="text-red-700 font-semibold">{dl.reason}</div>
                    <div className="text-gray-400 mt-0.5">
                      {new Date(dl.received_at).toLocaleString()} · retries: {dl.retry_count}
                    </div>
                  </div>
                ))
              ) : (
                <div className="px-4 py-8 text-center text-gray-400 text-sm">
                  No dead letters — clean
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Deployment reference */}
        <div className="bg-gray-900 rounded-lg p-4 text-xs font-mono text-gray-300">
          <div className="text-gray-500 mb-2">/* v0.4 — Messaging Infrastructure */</div>
          <div>Pipeline: Meta Webhook → whatsapp_events (immutable) → outbox(message.event) → applyMessageProjection</div>
          <div>Migrations: 064 (collection_actions delivery cols + dead_letter_events), 065 (customer projections)</div>
          <div className="mt-1 text-gray-500">Tag: v0.4 | Project: BillZo</div>
        </div>
      </div>
    </div>
  )
}
