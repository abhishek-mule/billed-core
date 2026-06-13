"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"
import {
  Loader2, Send, Phone, IndianRupee, CheckCircle2,
  Clock, AlertTriangle, AlertCircle,
  BarChart3, Plus,
  TrendingUp, HeartHandshake, Zap,
} from "lucide-react"
import { formatINR } from "@/lib/utils"
import type { QueueApiItem, QueueApiSummary, QueueApiResponse, RecentEvent } from "@/lib/billzo/api-types"

function actionCfg(recId: string) {
  switch (recId) {
    case "send_reminder":  return { label: "Send reminder", icon: Send,         cls: "bg-slate-900 text-white hover:bg-slate-800" }
    case "call":           return { label: "Call",          icon: Phone,         cls: "bg-slate-900 text-white hover:bg-slate-800" }
    case "record_payment": return { label: "Record",        icon: IndianRupee,   cls: "bg-slate-900 text-white hover:bg-slate-800" }
    case "mark_resolved":  return { label: "Resolve",       icon: CheckCircle2,  cls: "bg-emerald-600 text-white hover:bg-emerald-700" }
    case "wait":           return { label: "Wait",          icon: Clock,         cls: "bg-slate-100 text-slate-600 hover:bg-slate-200" }
    default:               return { label: "Act",           icon: Zap,           cls: "bg-slate-900 text-white hover:bg-slate-800" }
  }
}

function why(item: QueueApiItem): { text: string; cls: string } {
  if (item.overdue > 30)  return { text: `${item.overdue}d overdue — high risk`, cls: "text-red-600 bg-red-50" }
  if (item.overdue > 7)   return { text: `${item.overdue}d overdue`,           cls: "text-red-600 bg-red-50" }
  if (item.overdue > 0)   return { text: `${item.overdue}d overdue`,           cls: "text-amber-600 bg-amber-50" }
  if (item.promiseStatus === "broken") return { text: "Promise broken",         cls: "text-red-600 bg-red-50" }
  if (item.promiseStatus === "pending") return { text: "Promise pending",       cls: "text-blue-600 bg-blue-50" }
  if (item.engagementState === "ghosting") return { text: "Ghosting",           cls: "text-red-600 bg-red-50" }
  return { text: "Needs attention", cls: "text-slate-500 bg-slate-100" }
}

function formatTime(iso: string) {
  const d = new Date(iso)
  const now = Date.now()
  const diff = now - d.getTime()
  if (diff < 60000) return "just now"
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}

export default function BillZoHome() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<QueueApiSummary | null>(null)
  const [items, setItems] = useState<QueueApiItem[]>([])
  const [recentEvents, setRecentEvents] = useState<RecentEvent[]>([])
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [completedCase, setCompletedCase] = useState<string | null>(null)

  // ── data fetching ──
  const loadQueue = useCallback(async () => {
    try {
      setError(null)
      const res = await fetch("/api/recovery/queue", { credentials: "include" })
      if (!res.ok) throw new Error(`API error: ${res.status}`)
      const data: QueueApiResponse = await res.json()
      setSummary(data.summary)
      setItems(data.items)
      setRecentEvents(data.recentEvents || [])
      setLoading(false)
    } catch (err) {
      console.error("Failed to load queue:", err)
      setError(err instanceof Error ? err.message : "Failed to load")
      setLoading(false)
    }
  }, [])

  const pollQueueWithBackoff = useCallback(async (maxAttempts = 5, delayMs = 500) => {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise(resolve => setTimeout(resolve, delayMs * Math.pow(2, attempt)))
      try {
        const res = await fetch("/api/recovery/queue", { credentials: "include" })
        if (!res.ok) continue
        const data: QueueApiResponse = await res.json()
        setSummary(data.summary)
        setItems(data.items)
        setRecentEvents(data.recentEvents || [])
        setLoading(false)
        setError(null)
        return
      } catch {}
    }
  }, [])

  useEffect(() => {
    loadQueue()
    const onInvoiceCreated = () => pollQueueWithBackoff(4, 300)
    window.addEventListener("billzo:invoice-created", onInvoiceCreated as EventListener)
    window.addEventListener("billzo:changed", loadQueue)
    return () => {
      window.removeEventListener("billzo:invoice-created", onInvoiceCreated as EventListener)
      window.removeEventListener("billzo:changed", loadQueue)
    }
  }, [loadQueue, pollQueueWithBackoff])

  const handleAction = async (caseId: string, action: string, payload?: Record<string, any>) => {
    setActionLoading(`${caseId}:${action}`)
    try {
      const res = await fetch("/api/recovery/queue/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ caseId, action, payload }),
      })
      if (!res.ok) throw new Error(`Action failed`)
      setCompletedCase(caseId)
      setTimeout(() => setCompletedCase(null), 2000)
      await loadQueue()
    } catch (err) {
      console.error("Action failed:", err)
    } finally {
      setActionLoading(null)
    }
  }

  // ── derived ──
  const priorityItems = useMemo(() =>
    items.filter(i => i.recommendedAction.id !== "wait" && i.recommendedAction.id !== "record_payment"),
    [items]
  )

  const alertCount = priorityItems.length +
    items.filter(i => i.promiseStatus === "broken" || i.engagementState === "ghosting").length

  // ── loading ──
  if (loading) {
    return (
      <div className="px-4 py-8 max-w-lg mx-auto space-y-3">
        <div className="h-16 bg-slate-100 animate-pulse rounded-lg" />
        <div className="h-48 bg-slate-100 animate-pulse rounded-lg" />
        <div className="h-16 bg-slate-100 animate-pulse rounded-lg" />
        <div className="h-24 bg-slate-100 animate-pulse rounded-lg" />
      </div>
    )
  }

  // ── error ──
  if (error) {
    return (
      <div className="px-4 py-20 max-w-lg mx-auto">
        <div className="border border-red-200 rounded-lg p-6 text-center bg-white">
          <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-3" />
          <p className="text-sm font-semibold text-red-900 mb-1">Something went wrong</p>
          <p className="text-xs text-red-600 mb-4">{error}</p>
          <button
            onClick={() => { setError(null); setLoading(true); loadQueue() }}
            className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (!summary) return null

  const hasActions = priorityItems.length > 0

  // ── render ──
  return (
    <div className="min-h-screen bg-slate-50 pb-8">
      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">

        {/* ════════════════════════════════════════
           LAYER 1 — PULSE
           ════════════════════════════════════════ */}
        <div className="bg-white border border-slate-200 rounded-lg">
          <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Pulse</p>
            <button
              onClick={() => router.push("/pos")}
              className="flex items-center gap-1 px-2.5 py-1 bg-slate-900 text-white text-[11px] font-medium rounded-md hover:bg-slate-800"
            >
              <Plus className="h-3 w-3" />
              New Sale
            </button>
          </div>
          <div className="grid grid-cols-3 divide-x divide-slate-100 border-t border-slate-100">
            <div className="px-4 py-3">
              <p className="text-[11px] text-slate-500 font-medium">Collected today</p>
              <p className="text-lg font-bold tabular-nums tracking-tight text-slate-900 mt-0.5">
                {formatINR(summary.totalCollectedToday || 0)}
              </p>
            </div>
            <div className="px-4 py-3">
              <p className="text-[11px] text-slate-500 font-medium">Pending collection</p>
              <p className="text-lg font-bold tabular-nums tracking-tight text-slate-900 mt-0.5">
                {formatINR(summary.collectibleToday || 0)}
              </p>
            </div>
            <div className="px-4 py-3">
              <p className="text-[11px] text-slate-500 font-medium">Alerts</p>
              <p className={`text-lg font-bold tabular-nums tracking-tight mt-0.5 ${alertCount > 0 ? "text-red-600" : "text-emerald-600"}`}>
                {alertCount}
              </p>
            </div>
          </div>
        </div>

        {/* ════════════════════════════════════════
           LAYER 2 — AI ACTION CENTER
           ════════════════════════════════════════ */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Zap className="h-4 w-4 text-slate-700" />
            <h2 className="text-sm font-semibold text-slate-900">
              {hasActions ? "Priority Actions" : "AI Action Center"}
            </h2>
            {hasActions && (
              <span className="text-[11px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                {priorityItems.length}
              </span>
            )}
          </div>

          {hasActions ? (
            <div className="space-y-2">
              {priorityItems.slice(0, 5).map(item => {
                const isBusy = actionLoading?.startsWith(item.caseId)
                const done = completedCase === item.caseId
                const cfg = actionCfg(item.recommendedAction.id)
                const reason = why(item)
                const isWait = item.recommendedAction.id === "wait"

                return (
                  <div
                    key={item.caseId}
                    className={`bg-white border rounded-lg px-4 py-3.5 transition-all ${
                      done ? "border-emerald-200 bg-emerald-50/50" : "border-slate-200"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-900 truncate">
                            {item.customer.name}
                          </span>
                          {item.customer.tier === "vip" && (
                            <span className="text-[10px] font-semibold text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">VIP</span>
                          )}
                        </div>
                        <p className="text-lg font-bold tabular-nums tracking-tight text-slate-900 mt-0.5">
                          {formatINR(item.amount)}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${reason.cls}`}>
                            {reason.text}
                          </span>
                          {item.reminderCount > 0 && (
                            <span className="text-[11px] text-slate-500">{item.reminderCount}r</span>
                          )}
                        </div>
                      </div>

                      <div className="shrink-0">
                        {!isWait && (
                          <button
                            onClick={() => handleAction(item.caseId, item.recommendedAction.id)}
                            disabled={!!isBusy}
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all disabled:opacity-50 ${cfg.cls}`}
                          >
                            {isBusy ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : done ? (
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            ) : (
                              <cfg.icon className="h-3.5 w-3.5" />
                            )}
                            {cfg.label}
                          </button>
                        )}
                      </div>
                    </div>

                    {!isWait && item.secondaryActions.length > 0 && (
                      <div className="flex gap-1.5 mt-2.5">
                        {item.secondaryActions.slice(0, 3).map(act => (
                          <button
                            key={act.id}
                            onClick={() => handleAction(item.caseId, act.id)}
                            disabled={!!actionLoading}
                            className="text-[11px] px-2 py-1 rounded-md text-slate-500 bg-slate-100 hover:bg-slate-200 disabled:opacity-50"
                          >
                            {act.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-lg px-4 py-6 text-center">
              <p className="text-sm font-semibold text-slate-900">All systems nominal</p>
              <p className="text-xs text-slate-500 mt-1">No pending tasks requiring your attention</p>
            </div>
          )}
        </div>

        {/* ════════════════════════════════════════
           LAYER 3 — HEALTH CARDS
           ════════════════════════════════════════ */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-white border border-slate-200 rounded-lg px-4 py-3">
            <p className="text-[11px] text-slate-500 font-medium">Sales today</p>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-base font-bold tabular-nums tracking-tight text-slate-900">
                {formatINR(summary.todaySales || 0)}
              </p>
              {summary.todaySales > 0 && summary.monthSales > 0 && (
                <span className="text-[11px] font-medium text-emerald-600 flex items-center gap-0.5">
                  <TrendingUp className="h-3 w-3" />
                  {Math.round((summary.todaySales / (summary.monthSales / Math.max(new Date().getDate(), 1))) * 100 - 100)}%
                </span>
              )}
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg px-4 py-3">
            <p className="text-[11px] text-slate-500 font-medium">This month</p>
            <p className="text-base font-bold tabular-nums tracking-tight text-slate-900 mt-1">
              {formatINR(summary.monthSales || 0)}
            </p>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg px-4 py-3">
            <p className="text-[11px] text-slate-500 font-medium">Inventory alerts</p>
            <p className={`text-base font-bold tabular-nums tracking-tight mt-1 ${summary.lowStockItems > 0 ? "text-amber-600" : "text-slate-900"}`}>
              {summary.lowStockItems > 0 ? `${summary.lowStockItems} low` : "OK"}
            </p>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg px-4 py-3">
            <p className="text-[11px] text-slate-500 font-medium">Customers</p>
            <p className="text-base font-bold tabular-nums tracking-tight text-slate-900 mt-1">
              {summary.totalCustomers}
              {summary.vipCustomers > 0 && (
                <span className="text-[11px] font-medium text-slate-500 ml-1">
                  ({summary.vipCustomers} VIP)
                </span>
              )}
            </p>
          </div>
        </div>

        {/* ════════════════════════════════════════
           LAYER 4 — RECENT ACTIVITY
           ════════════════════════════════════════ */}
        {recentEvents.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2.5">
              <BarChart3 className="h-4 w-4 text-slate-700" />
              <h2 className="text-sm font-semibold text-slate-900">Recent activity</h2>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">
              {recentEvents.slice(0, 5).map((evt, i) => (
                <div key={i} className="flex items-start gap-3 px-4 py-2.5">
                  <div className={`mt-0.5 h-2 w-2 rounded-full shrink-0 ${
                    evt.eventType === "transition" ? "bg-blue-500" :
                    evt.eventType === "backfill" ? "bg-amber-500" : "bg-slate-400"
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-700 truncate">{evt.reason}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{formatTime(evt.occurredAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════
           FOOTER
           ════════════════════════════════════════ */}
        {summary.totalCollectedToday > 0 && (
          <div className="text-center pt-1">
            <p className="text-[10px] text-slate-400">
              {formatINR(summary.recoveredToday)} of {formatINR(summary.totalCollectedToday)} collected today attributed to BillZo
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
