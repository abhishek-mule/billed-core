"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Search, ChevronLeft, ChevronRight,
  RefreshCw, MessageSquare, CheckCircle2,
  Clock, AlertCircle, XCircle, Loader2, Phone, Hand, CreditCard,
} from "lucide-react"
import { MerchantLanguage } from "@billzo/shared"
import { formatINR } from "@/lib/utils"
import { EmptyState } from "@/components/billzo/EmptyState"
import { ErrorState } from "@/components/billzo/ErrorState"
import { Skeleton } from "@/components/billzo/Skeleton"
import { getCollectionRisk, COLLECTION_RISK_TONE_CLASSES, type CollectionRiskStage } from "@/lib/billzo/recovery-risk"

interface HistoryEvent {
  id: string
  customerId: string
  customerName: string
  customerPhone: string
  invoiceId: string
  invoiceNumber: string
  amount: number
  stage: string
  status: string
  messagePreview: string
  occurredAt: string
  deliveredAt: string | null
  readAt: string | null
  failedAt: string | null
}

interface TimelineEvent {
  id: string
  type: "reminder" | "promise" | "payment" | "call" | "system"
  customerId: string
  customerName: string
  customerPhone: string
  amount: number
  label: string
  detail: string
  occurredAt: string
  status: string
}

interface ApiResponse {
  events: HistoryEvent[]
  total: number
  page: number
  limit: number
}

interface TimelineResponse {
  events: TimelineEvent[]
  total: number
}

const TABS = [
  { key: "reminders", label: "Reminders" },
  { key: "timeline", label: "Timeline" },
]

const STAGE_LABELS: Record<string, string> = {
  t0_soft: "Soft",
  t24_nudge: "Nudge",
  t72_strong: "Strong",
  t5_warning: "Warning",
}

const STAGE_COLORS: Record<string, string> = {
  t0_soft: "bg-info-soft text-info",
  t24_nudge: "bg-outstanding-soft text-outstanding",
  t72_strong: "bg-warning-soft text-warning",
  t5_warning: "bg-danger-soft text-danger",
}

const STATUS_BADGES: Record<string, string> = {
  queued: "bg-muted text-muted-foreground",
  sent: "bg-info-soft text-info",
  server_ack: "bg-info-soft text-info",
  delivered: "bg-success-soft text-success",
  read: "bg-success-soft text-success",
  failed: "bg-danger-soft text-danger",
  rate_limited: "bg-warning-soft text-warning",
}

const STATUS_ICONS: Record<string, typeof Clock> = {
  queued: Clock,
  sent: MessageSquare,
  server_ack: MessageSquare,
  delivered: CheckCircle2,
  read: CheckCircle2,
  failed: XCircle,
  rate_limited: AlertCircle,
}

const TYPE_ICONS: Record<string, typeof MessageSquare> = {
  reminder: MessageSquare,
  promise: Hand,
  payment: CreditCard,
  call: Phone,
  system: Clock,
}

const TYPE_COLORS: Record<string, string> = {
  reminder: "bg-info-soft text-info",
  promise: "bg-outstanding-soft text-outstanding",
  payment: "bg-success-soft text-success",
  call: "bg-recovery-soft text-recovery",
  system: "bg-muted text-muted-foreground",
}

/** Map a reminder stage to its CollectionRisk stage so the forecast reuses
 *  the same 5-stage scale as the rest of the product. */
function stageToRiskStage(stage: string): CollectionRiskStage {
  switch (stage) {
    case "t5_warning": return "Critical"
    case "t72_strong": return "Urgent"
    case "t24_nudge": return "Attention"
    default: return "Monitor"
  }
}

function ForecastCard({ events }: { events: HistoryEvent[] }) {
  if (events.length === 0) return null
  const latest = events.reduce((a, b) =>
    new Date(a.occurredAt) > new Date(b.occurredAt) ? a : b
  )
  const worstRisk = events
    .map(e => getCollectionRisk({ overdueDays: stageToRiskStage(e.stage) === "Critical" ? 31 : stageToRiskStage(e.stage) === "Urgent" ? 20 : stageToRiskStage(e.stage) === "Attention" ? 10 : 3 }))
    .sort((x, y) => y.rank - x.rank)[0]
  const tone = COLLECTION_RISK_TONE_CLASSES[worstRisk.tone]

  const cells = [
    { label: "Last reminder", value: latest.customerName, sub: formatDateTime(latest.occurredAt) },
    { label: "Next reminder", value: "Auto-scheduled", sub: worstRisk.recommendation },
    {
      label: "Recommended",
      value: worstRisk.label,
      sub: worstRisk.recommendation,
      toneClass: `${tone.text} ${tone.bg}`,
    },
  ]

  return (
    <div className="bg-card border border-border rounded-2xl p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Forecast</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {cells.map(c => (
          <div key={c.label} className="rounded-xl bg-muted/40 px-3 py-2.5">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{c.label}</p>
            <p className={`text-sm font-semibold mt-0.5 truncate ${c.toneClass || "text-foreground"}`}>{c.value}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{c.sub}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function formatDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
}

function formatDateTime(iso: string) {
  return `${formatDate(iso)} ${formatTime(iso)}`
}

export default function RecoveryHistoryPage() {
  const [tab, setTab] = useState("reminders")
  const [events, setEvents] = useState<HistoryEvent[]>([])
  const [timeline, setTimeline] = useState<TimelineEvent[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const limit = 50

  const loadReminders = useCallback(async (p: number, s: string, st: string) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ page: String(p), limit: String(limit) })
      if (s) params.set("search", s)
      if (st) params.set("status", st)
      const res = await fetch(`/api/recovery/history?${params}`, { credentials: "include" })
      if (!res.ok) throw new Error(`API error: ${res.status}`)
      const data: ApiResponse = await res.json()
      setEvents(data.events)
      setTotal(data.total)
    } catch (err: any) {
      setError(err.message || "Failed to load")
    } finally {
      setLoading(false)
    }
  }, [])

  const loadTimeline = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/recovery/timeline", { credentials: "include" })
      if (!res.ok) throw new Error(`API error: ${res.status}`)
      const data: TimelineResponse = await res.json()
      setTimeline(data.events)
      setTotal(data.total)
    } catch (err: any) {
      setError(err.message || "Failed to load")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (tab === "reminders") {
      const timer = setTimeout(() => loadReminders(page, search, statusFilter), 300)
      return () => clearTimeout(timer)
    } else {
      loadTimeline()
    }
  }, [tab, page, search, statusFilter, loadReminders, loadTimeline])

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="page-shell max-w-5xl">
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-foreground">{MerchantLanguage.recovery.history}</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {tab === "reminders" ? `${total} events tracked` : `${total} timeline events`}
            </p>
          </div>
          <button
            onClick={() => tab === "reminders" ? loadReminders(page, search, statusFilter) : loadTimeline()}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-xs font-medium text-muted-foreground bg-card hover:bg-muted"
          >
            <RefreshCw className="h-3.5 w-3.5" /> {MerchantLanguage.common.refresh}
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setPage(1) }}
              className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
                tab === t.key
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-muted-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Filters (reminders only) */}
        {tab === "reminders" && (
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1) }}
                placeholder="Search by name or phone..."
                className="w-full h-10 rounded-lg border border-border bg-card pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <select
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
              className="h-10 rounded-lg border border-border bg-card px-3 text-sm text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="">All statuses</option>
              <option value="queued">Queued</option>
              <option value="sent">Sent</option>
              <option value="delivered">Delivered</option>
              <option value="read">Read</option>
              <option value="failed">Failed</option>
            </select>
          </div>
        )}

        {/* Error */}
        {error && (
          <ErrorState message={error} severity="error" onRetry={() => tab === "reminders" ? loadReminders(page, search, statusFilter) : loadTimeline()} />
        )}

        {/* Loading */}
        {loading && (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && (
          <>
            {tab === "reminders" && events.length === 0 && (
              <EmptyState
                icon={<MessageSquare className="h-6 w-6" />}
                title={search ? "No reminders match your search" : "No reminders sent yet"}
                description={search ? "Try a different search term." : "Reminders will appear here once sent."}
              />
            )}
            {tab === "timeline" && timeline.length === 0 && (
              <EmptyState
                icon={<Clock className="h-6 w-6" />}
                title="No activity yet"
                description="Promises, payments, calls, and reminders will appear here."
              />
            )}
          </>
        )}

        {/* Forecast — Last / Next / Recommended */}
        {!loading && tab === "reminders" && events.length > 0 && (
          <ForecastCard events={events} />
        )}

        {/* Reminders table */}
        {!loading && tab === "reminders" && events.length > 0 && (
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Date</th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Customer</th>
                    <th className="text-right px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Amount</th>
                    <th className="text-center px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Stage</th>
                    <th className="text-center px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Preview</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">                  {events.map((evt) => {
                    const StatusIcon = STATUS_ICONS[evt.status] || Clock
                    const stageCls = STAGE_COLORS[evt.stage] || "bg-muted text-muted-foreground"
                    const statusCls = STATUS_BADGES[evt.status] || "bg-muted text-muted-foreground"
                    return (
                      <tr key={evt.id} className="hover:bg-muted/50 transition-colors">
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          <p>{formatDate(evt.occurredAt)}</p>
                          <p className="text-[10px] text-muted-foreground">{formatTime(evt.occurredAt)}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium text-foreground">{evt.customerName}</p>
                          {evt.customerPhone && (
                            <p className="text-[11px] text-muted-foreground font-mono">{evt.customerPhone}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-semibold text-foreground tabular-nums whitespace-nowrap">
                          {formatINR(evt.amount)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${stageCls}`}>
                            {STAGE_LABELS[evt.stage] || evt.stage}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusCls}`}>
                            <StatusIcon size={10} />
                            {evt.status === 'server_ack' ? 'ACK' : evt.status === 'rate_limited' ? 'RATE' : evt.status}
                          </span>
                          {evt.deliveredAt && (
                            <p className="text-[10px] text-success mt-0.5">Delivered {formatTime(evt.deliveredAt)}</p>
                          )}
                          {evt.readAt && (
                            <p className="text-[10px] text-success">Read {formatTime(evt.readAt)}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground max-w-[200px] truncate">
                          {evt.messagePreview || "—"}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/50">
              <p className="text-xs text-muted-foreground">
                Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="flex items-center gap-1 px-3 py-1.5 border border-border rounded-lg text-xs font-medium text-muted-foreground bg-card hover:bg-muted/50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="h-3.5 w-3.5" /> Prev
                </button>
                <span className="text-xs text-muted-foreground font-medium">{page} / {totalPages}</span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="flex items-center gap-1 px-3 py-1.5 border border-border rounded-lg text-xs font-medium text-muted-foreground bg-card hover:bg-muted/50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Timeline view */}
        {!loading && tab === "timeline" && timeline.length > 0 && (
          <div className="space-y-3">
            {timeline.map((evt) => {
              const TypeIcon = TYPE_ICONS[evt.type] || Clock
              const typeColor = TYPE_COLORS[evt.type] || "bg-muted text-muted-foreground"
              return (
                <div key={evt.id} className="bg-card border border-border rounded-2xl p-4 transition-shadow">
                  <div className="flex items-start gap-4">
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${typeColor}`}>
                      <TypeIcon size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-foreground">{evt.customerName}</p>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${typeColor}`}>
                          {evt.label}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{evt.detail}</p>
                      <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground">
                        <span>{formatDateTime(evt.occurredAt)}</span>
                        {evt.amount > 0 && <span className="font-medium text-foreground">{formatINR(evt.amount)}</span>}
                        <span className={`capitalize ${
                          evt.status === "success" || evt.status === "delivered" || evt.status === "read" || evt.status === "fulfilled"
                            ? "text-success" : evt.status === "failed" || evt.status === "broken"
                            ? "text-danger" : "text-muted-foreground"
                        }`}>
                          {evt.status}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
