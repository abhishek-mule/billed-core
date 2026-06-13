"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"
import {
  Loader2, Send, Phone, IndianRupee, CheckCircle2,
  Clock, Shield, AlertTriangle, AlertCircle,
  Users, BarChart3, Plus,
  TrendingUp, ChevronDown, Zap,
  AlertOctagon, HeartHandshake,
} from "lucide-react"
import { formatINR } from "@/lib/utils"
import type { QueueApiItem, QueueApiSummary, QueueApiResponse } from "@/lib/billzo/api-types"

const GREETINGS = [
  { before: 12, text: "Good morning 🌅" },
  { before: 17, text: "Good afternoon ☀️" },
  { before: 24, text: "Good evening 🌙" },
]

function greeting() {
  const h = new Date().getHours()
  return GREETINGS.find(g => h < g.before)?.text || GREETINGS[0].text
}

const engagementLabel: Record<string, string> = {
  unseen: "Not seen", engaged: "Engaged", intent: "Showed intent",
  likely_to_pay: "Likely to pay", ghosting: "Ghosting",
}

function actionButton(recId: string) {
  switch (recId) {
    case "send_reminder": return { label: "Send Reminder", bg: "bg-amber-500 hover:bg-amber-600", icon: Send }
    case "call": return { label: "Call Customer", bg: "bg-blue-500 hover:bg-blue-600", icon: Phone }
    case "record_payment": return { label: "Record Payment", bg: "bg-green-500 hover:bg-green-600", icon: IndianRupee }
    case "mark_resolved": return { label: "Mark Resolved", bg: "bg-emerald-500 hover:bg-emerald-600", icon: CheckCircle2 }
    case "wait": return { label: "Wait", bg: "bg-gray-100 text-gray-700 hover:bg-gray-200", icon: Clock }
    default: return { label: "Take Action", bg: "bg-primary hover:bg-primary/90", icon: Zap }
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
  const [insightsOpen, setInsightsOpen] = useState(false)

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

  const needsAction = useMemo(() =>
    items.filter(i => i.recommendedAction.id !== "wait" && i.recommendedAction.id !== "record_payment"),
    [items]
  )

  const hasPromises = useMemo(() =>
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

  if (loading) {
    return (
      <div className="px-4 py-6 max-w-lg mx-auto space-y-4">
        <div className="h-32 bg-muted animate-pulse rounded-2xl" />
        <div className="h-28 bg-muted animate-pulse rounded-2xl" />
        <div className="h-40 bg-muted animate-pulse rounded-2xl" />
        <div className="h-20 bg-muted animate-pulse rounded-2xl" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="px-4 py-16 max-w-lg mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
          <AlertCircle className="h-10 w-10 text-red-600 mx-auto mb-3" />
          <p className="text-sm font-medium text-red-900 mb-1">Something went wrong</p>
          <p className="text-xs text-red-700 mb-4">{error}</p>
          <button
            onClick={() => { setError(null); setLoading(true); loadQueue() }}
            className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-xl hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (!summary) return null

  return (
    <div className="min-h-screen bg-gray-50/80 pb-6">
      <div className="max-w-lg mx-auto px-4 py-5 space-y-4">

        {/* ════════════════════════════════════════
           SECTION 1 — Hero
           ════════════════════════════════════════ */}
        <div className="bg-gradient-to-br from-indigo-600 via-indigo-700 to-purple-800 rounded-2xl p-5 text-white shadow-lg shadow-indigo-200">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-bold">{greeting()}</h1>
              <p className="text-indigo-200 text-sm mt-0.5">Here's your business today</p>
            </div>
            <button
              onClick={() => router.push("/pos")}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 backdrop-blur rounded-xl text-xs font-medium hover:bg-white/30"
            >
              <Plus className="h-3.5 w-3.5" />
              New Sale
            </button>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <div className="bg-white/10 rounded-xl px-3 py-3 text-center">
              <p className="text-lg font-bold">{formatINR(summary.totalCollectedToday || 0)}</p>
              <p className="text-[10px] text-indigo-200">Collected Today</p>
            </div>
            <div className="bg-white/10 rounded-xl px-3 py-3 text-center">
              <p className="text-lg font-bold">{summary.activeCases}</p>
              <p className="text-[10px] text-indigo-200">Active Cases</p>
            </div>
            <div className="bg-white/10 rounded-xl px-3 py-3 text-center">
              <p className="text-lg font-bold">{formatINR(summary.outstanding || 0)}</p>
              <p className="text-[10px] text-indigo-200">Outstanding</p>
            </div>
          </div>
        </div>

        {/* ════════════════════════════════════════
           SECTION 2 — Actions For You
           ════════════════════════════════════════ */}
        {needsAction.length === 0 && hasPromises.length === 0 && (
          <div className="bg-white border border-gray-200 rounded-2xl p-6 text-center shadow-sm">
            <Shield className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
            <p className="text-base font-bold text-gray-900">All caught up! 🎉</p>
            <p className="text-sm text-muted-foreground mt-1">No outstanding invoices need your attention right now.</p>
            <button
              onClick={() => router.push("/pos")}
              className="mt-4 px-4 py-2 bg-primary text-white text-sm font-medium rounded-xl hover:bg-primary/90"
            >
              Create New Invoice
            </button>
          </div>
        )}

        {needsAction.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Zap className="h-4 w-4 text-amber-500" />
              <h2 className="text-sm font-bold text-gray-800">Actions For You</h2>
              <span className="text-xs text-muted-foreground bg-gray-100 px-2 py-0.5 rounded-full">{needsAction.length}</span>
            </div>
            <div className="space-y-2">
              {[...new Map([...needsAction, ...hasPromises].map(i => [i.caseId, i])).values()].slice(0, 10).map(item => {
                const isBusy = actionLoading?.startsWith(item.caseId)
                const done = completedCase === item.caseId
                const urgency = item.overdue > 7 ? "high" : item.overdue > 0 ? "medium" : "low"
                const btn = actionButton(item.recommendedAction.id)
                const isWait = item.recommendedAction.id === "wait"

                return (
                  <div
                    key={item.caseId}
                    className={`bg-white border rounded-xl p-4 shadow-sm transition-all ${
                      done ? "border-green-300 bg-green-50" :
                      urgency === "high" ? "border-red-200" :
                      urgency === "medium" ? "border-amber-200" : "border-gray-200"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {urgency === "high" && <AlertOctagon className="h-4 w-4 text-red-500 shrink-0" />}
                          <span className="text-sm font-bold truncate">{item.customer.name}</span>
                          {item.customer.tier === "vip" && (
                            <span className="text-[9px] font-bold text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded-full">VIP</span>
                          )}
                        </div>
                        <p className="text-lg font-bold mt-0.5">{formatINR(item.amount)}</p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          {item.promiseStatus === "broken" && (
                            <span className="text-[10px] font-medium text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                              <AlertTriangle className="h-3 w-3" /> Promise broken
                            </span>
                          )}
                          {item.overdue > 0 && (
                            <span className="text-[10px] text-red-500 font-medium">{item.overdue}d overdue</span>
                          )}
                          {item.engagementState && (
                            <span className="text-[10px] text-muted-foreground">
                              · {engagementLabel[item.engagementState] || item.engagementState}
                            </span>
                          )}
                        </div>
                        {/* Priority explanation */}
                        <p className="text-[10px] text-muted-foreground mt-1.5">
                          #{item.rank} — {item.priorityReason}
                        </p>
                      </div>

                      {/* Primary action */}
                      <div className="shrink-0">
                        {!isWait && (
                          <button
                            onClick={() => handleAction(item.caseId, item.recommendedAction.id)}
                            disabled={!!isBusy}
                            className={`flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-medium text-white transition-all disabled:opacity-50 ${btn.bg}`}
                          >
                            {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <btn.icon className="h-3.5 w-3.5" />}
                            {btn.label}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Secondary actions */}
                    {!isWait && (
                      <div className="mt-2 flex items-center gap-1.5">
                        {item.secondaryActions.slice(0, 3).map(act => (
                          <button
                            key={act.id}
                            onClick={() => handleAction(item.caseId, act.id)}
                            disabled={!!actionLoading}
                            className="text-[10px] px-2 py-1 bg-gray-50 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-100 disabled:opacity-50"
                          >
                            {act.label}
                          </button>
                        ))}
                        {item.customer.phone && (
                          <a
                            href={`tel:${item.customer.phone}`}
                            className="text-[10px] px-2 py-1 bg-gray-50 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-100 flex items-center gap-1"
                          >
                            <Phone className="h-2.5 w-2.5" /> Call
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════
           SECTION 3 — Cash Flow Radar
           ════════════════════════════════════════ */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="h-4 w-4 text-gray-700" />
            <h2 className="text-sm font-bold text-gray-800">Cash Flow Radar</h2>
          </div>
          <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Outstanding</p>
                <p className="text-lg font-bold text-amber-700 mt-0.5">{formatINR(summary.outstanding || 0)}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Due Today</p>
                <p className="text-lg font-bold text-red-700 mt-0.5">{formatINR(summary.dueToday || 0)}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Today Sales</p>
                <p className="text-lg font-bold text-gray-900 mt-0.5">{formatINR(summary.todaySales || 0)}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">This Month</p>
                <p className="text-lg font-bold text-gray-900 mt-0.5">{formatINR(summary.monthSales || 0)}</p>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-muted-foreground">
              <span>{formatINR(summary.recoveredThisMonth || 0)} attributed to recovery this month</span>
              <TrendingUp className="h-3.5 w-3.5" />
            </div>
          </div>
        </div>

        {/* ════════════════════════════════════════
           SECTION 4 — Insights (collapsible)
           ════════════════════════════════════════ */}
        {(ghostingItems.length > 0 || partiallyPaid.length > 0 || items.filter(i => i.customer.tier === "vip" && i.overdue > 0).length > 0) && (
          <div>
            <button
              onClick={() => setInsightsOpen(!insightsOpen)}
              className="w-full flex items-center justify-between bg-white border border-gray-200 rounded-xl p-4 shadow-sm hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-blue-500" />
                <span className="text-sm font-bold text-gray-800">Insights</span>
                <span className="text-xs bg-gray-100 px-2 py-0.5 rounded-full text-muted-foreground">
                  {ghostingItems.length + partiallyPaid.length + items.filter(i => i.customer.tier === "vip" && i.overdue > 0).length}
                </span>
              </div>
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${insightsOpen ? 'rotate-180' : ''}`} />
            </button>

            {insightsOpen && (
              <div className="mt-2 space-y-2">

                {/* VIP Recommendations */}
                {items.filter(i => i.customer.tier === "vip").length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2 px-1">
                      <HeartHandshake className="h-3.5 w-3.5 text-purple-500" />
                      <h3 className="text-xs font-bold text-gray-700">Recommendations</h3>
                    </div>
                    <div className="space-y-2">
                      {items.filter(i => i.customer.tier === "vip").slice(0, 3).map(item => {
                        const isWait = item.recommendedAction.id === "wait"
                        const isEscalate = item.overdue > 14

                        return (
                          <div key={`rec-${item.caseId}`} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                            <div className="flex items-start gap-3">
                              <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${isWait ? "bg-blue-50" : isEscalate ? "bg-red-50" : "bg-amber-50"}`}>
                                {isWait ? <Clock className={`h-5 w-5 ${isWait ? "text-blue-600" : ""}`} /> :
                                 isEscalate ? <AlertTriangle className="h-5 w-5 text-red-600" /> :
                                 <Send className="h-5 w-5 text-amber-600" />}
                              </div>
                              <div className="flex-1">
                                <p className="text-sm font-bold">
                                  {isWait ? "Recommended: Wait" :
                                   isEscalate ? "Escalation Recommended" :
                                   "Recommended: Send Reminder"}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  {isWait
                                    ? `${item.customer.name} has ${item.promiseStatus === "pending" ? "promised payment" : "an active account"}. No action needed now.`
                                    : isEscalate
                                    ? `${item.overdue}d overdue. Consider moving to stronger tone or calling.`
                                    : "Due for recovery. Customer is reachable."}
                                </p>

                                <div className="mt-2 space-y-1">
                                  <p className="text-[10px] font-medium text-muted-foreground">Decision checks:</p>
                                  <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                                    {[
                                      { label: "Customer reachable", pass: true },
                                      { label: "No active promise", pass: !item.promiseStatus || item.promiseStatus !== "pending" },
                                      { label: "Not disputed", pass: item.recoveryState !== "disputed" },
                                      { label: "Cooldown passed", pass: item.lastActivityAt ? (Date.now() - new Date(item.lastActivityAt).getTime()) > 86400000 : true },
                                    ].map((check, ci) => (
                                      <span key={ci} className={`text-[10px] flex items-center gap-0.5 ${check.pass ? "text-green-600" : "text-red-500"}`}>
                                        {check.pass ? "✓" : "✗"} {check.label}
                                      </span>
                                    ))}
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 mt-2">
                                  <span className="text-xs font-medium">{item.customer.name}</span>
                                  <span className="text-xs text-muted-foreground">· {formatINR(item.amount)}</span>
                                </div>

                                <div className="flex gap-1.5 mt-2">
                                  {!isWait && (
                                    <button
                                      onClick={() => handleAction(item.caseId, "send_reminder")}
                                      disabled={!!actionLoading}
                                      className="text-[10px] px-2.5 py-1 bg-amber-500 text-white rounded-lg hover:bg-amber-600"
                                    >
                                      Send Reminder
                                    </button>
                                  )}
                                  <button
                                    onClick={() => handleAction(item.caseId, "call")}
                                    disabled={!!actionLoading}
                                    className="text-[10px] px-2.5 py-1 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                                  >
                                    Call Customer
                                  </button>
                                  <button
                                    onClick={() => handleAction(item.caseId, "snooze", { snoozeDays: 3 })}
                                    disabled={!!actionLoading}
                                    className="text-[10px] px-2.5 py-1 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200"
                                  >
                                    Wait 3 Days
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Relationship Health */}
                <div>
                  <div className="flex items-center gap-2 mb-2 px-1">
                    <HeartHandshake className="h-3.5 w-3.5 text-green-500" />
                    <h3 className="text-xs font-bold text-gray-700">Relationship Health</h3>
                  </div>
                  <div className="space-y-2">
                    {ghostingItems.length > 0 && (
                      <div className="bg-white border border-red-200 rounded-xl p-4 shadow-sm">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                          <p className="text-sm font-bold text-red-800">
                            {ghostingItems.length} customer{ghostingItems.length > 1 ? "s" : ""} becoming unresponsive
                          </p>
                        </div>
                        <p className="text-xs text-red-600 mt-1">{ghostingItems.map(i => i.customer.name).join(", ")} — not responding to reminders</p>
                      </div>
                    )}

                    {partiallyPaid.length > 0 && (
                      <div className="bg-white border border-emerald-200 rounded-xl p-4 shadow-sm">
                        <div className="flex items-center gap-2">
                          <TrendingUp className="h-4 w-4 text-emerald-500 shrink-0" />
                          <p className="text-sm font-bold text-emerald-800">
                            {partiallyPaid.length} customer{partiallyPaid.length > 1 ? "s" : ""} showed intent to pay
                          </p>
                        </div>
                        <p className="text-xs text-emerald-600 mt-1">Made partial payments after reminders</p>
                      </div>
                    )}

                    {items.filter(i => i.customer.tier === "vip" && i.overdue > 0).length > 0 && (
                      <div className="bg-white border border-purple-200 rounded-xl p-4 shadow-sm">
                        <div className="flex items-center gap-2">
                          <HeartHandshake className="h-4 w-4 text-purple-500 shrink-0" />
                          <p className="text-sm font-bold text-purple-800">
                            {items.filter(i => i.customer.tier === "vip" && i.overdue > 0).length} VIP customer{items.filter(i => i.customer.tier === "vip" && i.overdue > 0).length > 1 ? "s" : ""} overdue
                          </p>
                        </div>
                        <p className="text-xs text-purple-600 mt-1">May need personal attention to maintain relationship</p>
                      </div>
                    )}
                  </div>
                </div>

              </div>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════
           Attribution footnote
           ════════════════════════════════════════ */}
        {summary.totalCollectedToday > 0 && (
          <div className="text-center py-1">
            <p className="text-[10px] text-muted-foreground">
              {formatINR(summary.recoveredToday)} of {formatINR(summary.totalCollectedToday)} collected today attributed to BillZo
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
