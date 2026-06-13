"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"
import {
  Loader2, Send, Phone, IndianRupee, CheckCircle2,
  Clock, AlertTriangle, AlertCircle,
  Users, BarChart3, Plus,
  TrendingUp, Zap, HeartHandshake,
} from "lucide-react"
import { formatINR } from "@/lib/utils"
import type { QueueApiItem, QueueApiSummary, QueueApiResponse } from "@/lib/billzo/api-types"

const hrs = () => {
  const h = new Date().getHours()
  if (h < 12) return "morning"
  if (h < 17) return "afternoon"
  return "evening"
}

const engagementBadge: Record<string, { label: string; cls: string }> = {
  unseen:       { label: "Unseen",   cls: "text-slate-500 bg-slate-100" },
  engaged:      { label: "Engaged",  cls: "text-blue-600 bg-blue-50" },
  intent:       { label: "Intent",   cls: "text-emerald-600 bg-emerald-50" },
  likely_to_pay:{ label: "Likely",   cls: "text-emerald-600 bg-emerald-50" },
  ghosting:     { label: "Ghosting", cls: "text-red-600 bg-red-50" },
}

function actionCfg(recId: string) {
  switch (recId) {
    case "send_reminder":  return { label: "Send",   icon: Send,          cls: "bg-slate-900 text-white hover:bg-slate-800" }
    case "call":           return { label: "Call",    icon: Phone,         cls: "bg-slate-900 text-white hover:bg-slate-800" }
    case "record_payment": return { label: "Record",  icon: IndianRupee,   cls: "bg-slate-900 text-white hover:bg-slate-800" }
    case "mark_resolved":  return { label: "Resolve", icon: CheckCircle2,  cls: "bg-emerald-600 text-white hover:bg-emerald-700" }
    case "wait":           return { label: "Wait",    icon: Clock,         cls: "bg-slate-100 text-slate-600 hover:bg-slate-200" }
    default:               return { label: "Act",     icon: Zap,           cls: "bg-slate-900 text-white hover:bg-slate-800" }
  }
}

export default function BillZoHome() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<QueueApiSummary | null>(null)
  const [items, setItems] = useState<QueueApiItem[]>([])
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
  const urgentItems = useMemo(() =>
    items.filter(i => i.recommendedAction.id !== "wait" && i.recommendedAction.id !== "record_payment"),
    [items]
  )

  const promiseBreaks = useMemo(() =>
    items.filter(i => i.promiseStatus === "broken" || i.promiseStatus === "pending"),
    [items]
  )

  const ghostingItems = useMemo(() =>
    items.filter(i => i.engagementState === "ghosting"),
    [items]
  )

  const partiallyPaid = useMemo(() =>
    items.filter(i => i.recoveryState === "partial_payment"),
    [items]
  )

  const insightCount = ghostingItems.length + partiallyPaid.length +
    items.filter(i => i.customer.tier === "vip" && i.overdue > 0).length

  const towerItems = useMemo(() =>
    [...new Map([...urgentItems, ...promiseBreaks].map(i => [i.caseId, i])).values()].slice(0, 10),
    [urgentItems, promiseBreaks]
  )

  // ── loading ──
  if (loading) {
    return (
      <div className="px-4 py-8 max-w-lg mx-auto space-y-3">
        <div className="h-24 bg-slate-100 animate-pulse rounded-xl" />
        <div className="h-32 bg-slate-100 animate-pulse rounded-xl" />
        <div className="h-40 bg-slate-100 animate-pulse rounded-xl" />
        <div className="h-16 bg-slate-100 animate-pulse rounded-xl" />
      </div>
    )
  }

  // ── error ──
  if (error) {
    return (
      <div className="px-4 py-20 max-w-lg mx-auto">
        <div className="border border-red-200 rounded-xl p-6 text-center bg-white">
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

  // ── render ──
  return (
    <div className="min-h-screen bg-slate-50 pb-8">
      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">

        {/* ════════════════════════════════════════
           HEADER + KPI STRIP
           ════════════════════════════════════════ */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-between px-5 pt-4 pb-3">
            <div>
              <h1 className="text-base font-semibold text-slate-900">Good {hrs()}</h1>
              <p className="text-xs text-slate-500 mt-0.5">{summary.collectibleToday > 0 ? `${formatINR(summary.collectibleToday)} collectible today` : "No pending collections"}</p>
            </div>
            <button
              onClick={() => router.push("/pos")}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white text-xs font-medium rounded-lg hover:bg-slate-800"
            >
              <Plus className="h-3.5 w-3.5" />
              New Sale
            </button>
          </div>

          <div className="grid grid-cols-3 divide-x divide-slate-100 border-t border-slate-100">
            <div className="px-4 py-3">
              <p className="text-xs text-slate-500">Collected today</p>
              <p className="text-lg font-semibold tabular-nums tracking-tight text-slate-900 mt-0.5">{formatINR(summary.totalCollectedToday || 0)}</p>
            </div>
            <div className="px-4 py-3">
              <p className="text-xs text-slate-500">Active cases</p>
              <p className="text-lg font-semibold tabular-nums tracking-tight text-slate-900 mt-0.5">{summary.activeCases}</p>
            </div>
            <div className="px-4 py-3">
              <p className="text-xs text-slate-500">Outstanding</p>
              <p className="text-lg font-semibold tabular-nums tracking-tight text-slate-900 mt-0.5">{formatINR(summary.outstanding || 0)}</p>
            </div>
          </div>
        </div>

        {/* ════════════════════════════════════════
           CONTROL TOWER
           ════════════════════════════════════════ */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="h-4 w-4 text-slate-700" />
            <h2 className="text-sm font-semibold text-slate-900">Control Tower</h2>
            {towerItems.length > 0 && (
              <span className="text-[11px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">{towerItems.length}</span>
            )}
          </div>

          {/* ── URGENT BLOCK ── */}
          {towerItems.length > 0 && (
            <div className="space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 px-1">Urgent</div>
              <div className="space-y-1.5">
                {towerItems.map(item => {
                  const isBusy = actionLoading?.startsWith(item.caseId)
                  const done = completedCase === item.caseId
                  const severity = item.overdue > 7 ? "high" : item.overdue > 0 ? "medium" : "low"
                  const cfg = actionCfg(item.recommendedAction.id)
                  const isWait = item.recommendedAction.id === "wait"

                  return (
                    <div
                      key={item.caseId}
                      className={`bg-white border rounded-lg px-4 py-3 transition-all ${
                        done ? "border-emerald-300 bg-emerald-50/60" :
                        severity === "high" ? "border-red-200" :
                        severity === "medium" ? "border-amber-200" : "border-slate-200"
                      } shadow-[0_1px_2px_rgba(0,0,0,0.04)]`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-slate-900 truncate">{item.customer.name}</span>
                            {item.customer.tier === "vip" && (
                              <span className="text-[10px] font-semibold text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">VIP</span>
                            )}
                            {severity === "high" && (
                              <span className="text-[10px] font-semibold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">{item.overdue}d overdue</span>
                            )}
                            {severity === "medium" && (
                              <span className="text-[10px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">{item.overdue}d overdue</span>
                            )}
                          </div>
                          <p className="text-lg font-semibold tabular-nums tracking-tight text-slate-900 mt-0.5">{formatINR(item.amount)}</p>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            {item.promiseStatus === "broken" && (
                              <span className="text-[10px] font-medium text-red-600 bg-red-50 px-1.5 py-0.5 rounded">Promise broken</span>
                            )}
                            {item.engagementState && engagementBadge[item.engagementState] && (
                              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${engagementBadge[item.engagementState].cls}`}>
                                {engagementBadge[item.engagementState].label}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="shrink-0 flex flex-col items-end gap-1.5">
                          {!isWait && (
                            <button
                              onClick={() => handleAction(item.caseId, item.recommendedAction.id)}
                              disabled={!!isBusy}
                              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-50 ${cfg.cls}`}
                            >
                              {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <cfg.icon className="h-3.5 w-3.5" />}
                              {cfg.label}
                            </button>
                          )}
                          {item.secondaryActions.length > 0 && (
                            <div className="flex gap-1">
                              {item.secondaryActions.slice(0, 2).map(act => (
                                <button
                                  key={act.id}
                                  onClick={() => handleAction(item.caseId, act.id)}
                                  disabled={!!actionLoading}
                                  className="text-[10px] px-2 py-1 rounded-md text-slate-500 bg-slate-100 hover:bg-slate-200 disabled:opacity-50"
                                >
                                  {act.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── INSIGHT BLOCK ── */}
          {insightCount > 0 && (
            <div className="mt-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 px-1 mb-2">Insight</div>
              <div className="space-y-1.5">
                {ghostingItems.length > 0 && (
                  <div className="bg-white border border-slate-200 rounded-lg px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                      <p className="text-sm font-semibold text-slate-900">{ghostingItems.length} unresponsive</p>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{ghostingItems.map(i => i.customer.name).join(", ")} not responding to reminders</p>
                  </div>
                )}

                {partiallyPaid.length > 0 && (
                  <div className="bg-white border border-slate-200 rounded-lg px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-emerald-500 shrink-0" />
                      <p className="text-sm font-semibold text-slate-900">{partiallyPaid.length} showed intent to pay</p>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">Made partial payments after reminders</p>
                  </div>
                )}

                {items.filter(i => i.customer.tier === "vip" && i.overdue > 0).length > 0 && (
                  <div className="bg-white border border-slate-200 rounded-lg px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                    <div className="flex items-center gap-2">
                      <HeartHandshake className="h-4 w-4 text-purple-500 shrink-0" />
                      <p className="text-sm font-semibold text-slate-900">{items.filter(i => i.customer.tier === "vip" && i.overdue > 0).length} VIP overdue</p>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">May need personal attention to maintain relationship</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── HIGH-VALUE ACTIONS (empty state) ── */}
          {towerItems.length === 0 && insightCount === 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => router.push("/cashflow")} className="flex flex-col items-center gap-2 p-4 rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-colors">
                  <Send className="h-5 w-5 text-slate-700" />
                  <span className="text-xs font-medium text-slate-700">Send reminders</span>
                </button>
                <button onClick={() => router.push("/pulse")} className="flex flex-col items-center gap-2 p-4 rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-colors">
                  <BarChart3 className="h-5 w-5 text-slate-700" />
                  <span className="text-xs font-medium text-slate-700">View collections</span>
                </button>
                <button onClick={() => router.push("/pos")} className="flex flex-col items-center gap-2 p-4 rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-colors">
                  <Plus className="h-5 w-5 text-slate-700" />
                  <span className="text-xs font-medium text-slate-700">New invoice</span>
                </button>
                <button onClick={() => router.push("/customers")} className="flex flex-col items-center gap-2 p-4 rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-colors">
                  <Users className="h-5 w-5 text-slate-700" />
                  <span className="text-xs font-medium text-slate-700">Manage customers</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ════════════════════════════════════════
           CASH FLOW STRIP
           ════════════════════════════════════════ */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <div className="grid grid-cols-3 divide-x divide-slate-100">
            <div className="px-4 py-3.5">
              <p className="text-[11px] text-slate-500 font-medium">Due today</p>
              <p className="text-base font-semibold tabular-nums tracking-tight text-slate-900 mt-0.5">{formatINR(summary.dueToday || 0)}</p>
            </div>
            <div className="px-4 py-3.5">
              <p className="text-[11px] text-slate-500 font-medium">This month</p>
              <p className="text-base font-semibold tabular-nums tracking-tight text-slate-900 mt-0.5">{formatINR(summary.monthSales || 0)}</p>
            </div>
            <div className="px-4 py-3.5">
              <p className="text-[11px] text-slate-500 font-medium">Attributed</p>
              <p className="text-base font-semibold tabular-nums tracking-tight text-slate-900 mt-0.5">{formatINR(summary.recoveredThisMonth || 0)}</p>
            </div>
          </div>
        </div>

        {/* ════════════════════════════════════════
           FOOTER — attribution
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
