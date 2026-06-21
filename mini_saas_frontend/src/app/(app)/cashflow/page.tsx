"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  ChevronDown, ChevronRight, Send, Search, Loader2,
  Users, AlertCircle, RefreshCw,
  Zap, ArrowRight, TrendingUp,
  BarChart3, Wallet,
} from "lucide-react"
import { db } from "@/lib/billzo/db"
import { formatINR } from "@/lib/utils"
import { getCookie } from "@/lib/cookies"
import type { QueueApiItem, QueueApiSummary, QueueApiResponse, RecentEvent } from "@/lib/billzo/api-types"

// ── types ──
type AgingBucket = "1-7" | "8-15" | "16-30" | "30+"

const bucketLabel: Record<AgingBucket, string> = {
  "1-7": "1–7 days",
  "8-15": "8–15 days",
  "16-30": "16–30 days",
  "30+": "30+ days",
}

type ProbLevel = "high" | "medium" | "low"

function recoveryProbability(days: number, stage?: string): ProbLevel {
  if (days <= 7) return "high"
  if (days <= 15 && stage !== "t4_recovery") return "high"
  if (days <= 30) return "medium"
  return "low"
}

const probLabel: Record<ProbLevel, string> = { high: "High", medium: "Medium", low: "Low" }
const probColor: Record<ProbLevel, string> = {
  high: "text-emerald-600 bg-emerald-50",
  medium: "text-amber-600 bg-amber-50",
  low: "text-red-600 bg-red-50",
}

const stageLabels: Record<string, string> = {
  t0_soft: "Soft notice",
  t1_reminder: "Reminder sent",
  t2_followup: "Follow-up",
  t3_escalation: "Escalated",
  t4_recovery: "Recovery",
  resolved: "Resolved",
}

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24))
}

function getAgingBucket(days: number): AgingBucket {
  if (days <= 7) return "1-7"
  if (days <= 15) return "8-15"
  if (days <= 30) return "16-30"
  return "30+"
}

function getOutstanding(inv: any): number {
  return (inv.total || 0) - (inv.paidAmount || 0)
}

function fmtTime(iso: string) {
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  if (diff < 60000) return "just now"
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

// ── component ──
export default function CashflowPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [invoices, setInvoices] = useState<any[]>([])
  const [summary, setSummary] = useState<QueueApiSummary | null>(null)
  const [priorityItem, setPriorityItem] = useState<QueueApiItem | null>(null)
  const [recentEvents, setRecentEvents] = useState<RecentEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState(searchParams.get("q") || "")
  const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null)
  const [actingInvoice, setActingInvoice] = useState<string | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setError(null)
      const tenantId = getCookie("bz_tenant")
      if (!tenantId) { router.push("/auth"); return }

      const [invData, recoveryRes] = await Promise.all([
        db().invoices.where("tenantId").equals(tenantId).toArray(),
        fetch("/api/recovery/queue", { credentials: "include" }).then(r => r.ok ? r.json() : null),
      ])

      setInvoices(invData)
      if (recoveryRes) {
        // Handle both preview and full response
        if (recoveryRes.access === 'preview') {
          const preview = recoveryRes.data || {}
          setSummary({
            collectibleToday: 0,
            outstanding: preview.totalOverdue || 0,
            activeCases: preview.overdueCount || 0,
            recoveredToday: 0,
            recoveredThisWeek: 0,
            recoveredThisMonth: 0,
            recoveredAttributed: 0,
            totalCollectedToday: 0,
            dueToday: 0,
            queueSize: preview.overdueCount || 0,
            todaySales: 0,
            monthSales: 0,
            lowStockItems: 0,
            totalCustomers: 0,
            vipCustomers: 0,
            blockedRemindersToday: 0,
            stuckMoneyTotal: preview.totalOverdue || 0,
            customersNeedingAction: 0,
            collectedAfterFollowup: 0,
            casesResolvedThisMonth: 0,
            priorityCases: [],
          } as QueueApiSummary)
          setPriorityItem(null)
          setRecentEvents([])
        } else {
          const data = recoveryRes as QueueApiResponse
          setSummary(data.summary)
          setPriorityItem(data.items.find(i => i.recommendedAction.id !== "wait" && i.recommendedAction.id !== "record_payment") || null)
          setRecentEvents(data.recentEvents || [])
        }
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to load data"
      console.error("Failed to load cashflow:", err)
      setError(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  // ── derived from invoices ──
  const groups = useMemo(() => {
    const overdue = invoices.filter(i => i.status === "overdue" || i.status === "partial" || i.status === "unpaid")
    const map = new Map<string, any[]>()
    for (const inv of overdue) {
      const key = inv.customerId || inv.customerName
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(inv)
    }
    return Array.from(map.entries())
      .map(([customerId, invs]) => {
        const firstDue = invs.reduce((e, i) => i.dueAt < e.dueAt ? i : e, invs[0])
        return {
          customerId,
          customerName: invs[0].customerName || "Unknown",
          customerPhone: invs[0].customerPhone || "",
          invoiceCount: invs.length,
          totalOutstanding: invs.reduce((s, i) => s + getOutstanding(i), 0),
          totalAmount: invs.reduce((s, i) => s + (i.total || 0), 0),
          daysSinceFirstDue: daysSince(firstDue.dueAt),
          agingBucket: getAgingBucket(daysSince(firstDue.dueAt)),
          stage: [...new Set(invs.map(i => i.recoveryStage).filter(Boolean))][0] || "unknown",
          invoices: invs,
        }
      })
      .sort((a, b) => b.totalOutstanding - a.totalOutstanding)
  }, [invoices])

  const filtered = useMemo(() => {
    if (!q) return groups
    const lq = q.toLowerCase()
    return groups.filter(g =>
      g.customerName.toLowerCase().includes(lq) ||
      (g.customerPhone || "").includes(lq)
    )
  }, [groups, q])

  const bucketBreakdown = useMemo(() => {
    const bks: Record<AgingBucket, { count: number; total: number; invoiceCount: number; prob: Record<ProbLevel, number> }> = {
      "1-7": { count: 0, total: 0, invoiceCount: 0, prob: { high: 0, medium: 0, low: 0 } },
      "8-15": { count: 0, total: 0, invoiceCount: 0, prob: { high: 0, medium: 0, low: 0 } },
      "16-30": { count: 0, total: 0, invoiceCount: 0, prob: { high: 0, medium: 0, low: 0 } },
      "30+": { count: 0, total: 0, invoiceCount: 0, prob: { high: 0, medium: 0, low: 0 } },
    }
    for (const g of groups) {
      bks[g.agingBucket].count++
      bks[g.agingBucket].total += g.totalOutstanding
      bks[g.agingBucket].invoiceCount += g.invoiceCount
      const p = recoveryProbability(g.daysSinceFirstDue, g.stage)
      bks[g.agingBucket].prob[p] += g.totalOutstanding
    }
    return bks
  }, [groups])

  // ── 7-day forecast from invoice due dates ──
  const forecast = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const days: { label: string; inflow: number; date: Date }[] = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(today)
      d.setDate(d.getDate() + i)
      const label = i === 0 ? "Today" : i === 1 ? "Tom" : DAYS[d.getDay()]
      days.push({ label, inflow: 0, date: d })
    }
    for (const inv of invoices) {
      if (inv.status === "paid") continue
      const due = new Date(inv.dueAt)
      due.setHours(0, 0, 0, 0)
      for (const d of days) {
        if (due.getTime() === d.date.getTime()) {
          d.inflow += getOutstanding(inv)
        }
      }
    }
    return days
  }, [invoices])

  const predictedBalance = summary
    ? (summary.totalCollectedToday || 0) + forecast.reduce((s, d) => s + d.inflow, 0)
    : 0

  // ── handlers ──
  const handleSendReminder = async (inv: any, e: React.MouseEvent) => {
    e.stopPropagation()
    setActingInvoice(inv.id)
    try {
      await fetch("/api/whatsapp/send", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceId: inv.id,
          customerId: inv.customerId,
          customerName: inv.customerName,
          customerPhone: inv.customerPhone,
          amount: getOutstanding(inv),
          templateKey: inv.recoveryStage || "invoice",
          vars: { "1": inv.customerName, "2": String(getOutstanding(inv)) },
        }),
      })
    } catch (err) {
      console.error("Failed to send reminder:", err)
    } finally {
      setActingInvoice(null)
    }
  }

  // ── loading ──
  if (loading) {
    return (
      <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-5xl mx-auto space-y-4">
        <div className="h-6 bg-muted animate-pulse rounded w-48" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-border p-3 space-y-2">
              <div className="h-3 bg-muted animate-pulse rounded w-16" />
              <div className="h-6 bg-muted animate-pulse rounded w-24" />
            </div>
          ))}
        </div>
        <div className="h-20 bg-muted animate-pulse rounded-lg" />
        <div className="h-11 bg-muted animate-pulse rounded-lg" />
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-5xl mx-auto">
        <div className="border border-red-200 rounded-lg p-8 text-center bg-card">
          <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-3" />
          <p className="text-sm font-semibold text-red-900 mb-1">Something went wrong</p>
          <p className="text-xs text-red-600 mb-4">{error}</p>
          <button onClick={() => { setError(null); setLoading(true); loadData() }}
            className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 inline-flex items-center gap-2">
            <RefreshCw className="h-4 w-4" /> Retry
          </button>
        </div>
      </div>
    )
  }

  const totals = {
    outstanding: groups.reduce((s, g) => s + g.totalOutstanding, 0),
    count: groups.reduce((s, g) => s + g.invoiceCount, 0),
    customerCount: groups.length,
  }

  // ── render ──
  return (
    <div className="min-h-screen bg-muted/50 pb-8">
      <div className="max-w-5xl mx-auto px-4 lg:px-8 py-5 lg:py-8 space-y-5">

        {/* ════════════════════════════════════════
           HEADER ROW (title + compact search)
           ════════════════════════════════════════ */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">
              {totals.customerCount} customers &middot; {totals.count} invoices &middot; {formatINR(totals.outstanding)} outstanding
            </p>
          </div>

          <button
            onClick={() => setSearchOpen(!searchOpen)}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-xs font-medium text-muted-foreground bg-card hover:bg-muted"
          >
            <Search className="h-3.5 w-3.5" />
            {searchOpen ? "Close" : "Search"}
          </button>
        </div>

        {/* Collapsible search */}
        {searchOpen && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search by customer name or phone..."
              className="w-full h-10 rounded-lg border border-border bg-card pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
              autoFocus
            />
          </div>
        )}

        {/* ════════════════════════════════════════
           CASH POSITION (Hero)
           ════════════════════════════════════════ */}
        <div className="bg-card border border-border rounded-lg">
          <div className="flex items-center gap-2 px-4 pt-3.5 pb-2">
            <Wallet className="h-4 w-4 text-foreground" />
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Cash Position</p>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-border border-t border-border">
            <div className="px-4 py-3">
              <p className="text-[11px] text-muted-foreground font-medium">Available cash</p>
              <p className="text-lg font-bold tabular-nums tracking-tight text-foreground mt-0.5">
                {formatINR(summary?.totalCollectedToday || 0)}
              </p>
              <p className="text-[10px] text-emerald-600 mt-0.5 flex items-center gap-0.5">
                <TrendingUp className="h-3 w-3" /> collected today
              </p>
            </div>
            <div className="px-4 py-3">
              <p className="text-[11px] text-muted-foreground font-medium">Incoming (AR)</p>
              <p className="text-lg font-bold tabular-nums tracking-tight text-foreground mt-0.5">
                {formatINR(totals.outstanding)}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{totals.customerCount} customers owed</p>
            </div>
            <div className="px-4 py-3">
              <p className="text-[11px] text-muted-foreground font-medium">Outgoing (AP)</p>
              <p className="text-lg font-bold tabular-nums tracking-tight text-muted-foreground mt-0.5">
                &mdash;
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Data unavailable</p>
            </div>
            <div className="px-4 py-3">
              <p className="text-[11px] text-muted-foreground font-medium">Net position</p>
              <p className="text-lg font-bold tabular-nums tracking-tight text-foreground mt-0.5">
                {formatINR((summary?.totalCollectedToday || 0) + totals.outstanding)}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Cash + AR</p>
            </div>
          </div>
        </div>

        {/* ════════════════════════════════════════
           PRIORITY RECOVERY ACTION
           ════════════════════════════════════════ */}
        {priorityItem && (
          <div className="bg-card border border-border rounded-lg">
            <div className="flex items-center gap-2 px-4 pt-3.5 pb-2">
              <Zap className="h-4 w-4 text-amber-600" />
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Priority Action</p>
            </div>
            <div className="border-t border-border px-4 py-3.5">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{priorityItem.customer.name}</span>
                    {priorityItem.customer.tier === "vip" && (
                      <span className="text-[10px] font-semibold text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">VIP</span>
                    )}
                  </div>
                  <p className="text-lg font-bold tabular-nums tracking-tight text-foreground mt-0.5">
                    {formatINR(priorityItem.amount)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {priorityItem.overdue > 0 ? `${priorityItem.overdue}d overdue` : "Due soon"} &middot;
                    {priorityItem.reminderCount > 0 ? ` ${priorityItem.reminderCount} reminders sent` : " No reminders yet"}
                  </p>
                </div>
                <button
                  onClick={() => router.push(`/invoices/${priorityItem.caseId}`)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-foreground text-background text-xs font-medium rounded-lg hover:bg-foreground/90 shrink-0"
                >
                  Open Case <ArrowRight className="h-3 w-3" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════
           7-DAY FORECAST
           ════════════════════════════════════════ */}
        <div className="bg-card border border-border rounded-lg">
          <div className="flex items-center gap-2 px-4 pt-3.5 pb-2">
            <BarChart3 className="h-4 w-4 text-foreground" />
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">7-Day Forecast</p>
          </div>
          <div className="border-t border-border px-4 py-3.5">
            <div className="grid grid-cols-7 gap-1.5">
              {forecast.map((d, i) => (
                <div key={i} className="text-center">
                  <p className="text-[10px] text-muted-foreground font-medium">{d.label}</p>
                  <p className="text-xs font-semibold tabular-nums tracking-tight text-foreground mt-1">
                    {d.inflow > 0 ? formatINR(d.inflow) : "—"}
                  </p>
                  <div className="mt-1.5 h-1 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-foreground transition-all"
                      style={{ width: `${Math.min((d.inflow / Math.max(...forecast.map(x => x.inflow), 1)) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-2.5 border-t border-border flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Predicted balance</span>
              <span className="font-semibold tabular-nums tracking-tight text-foreground">{formatINR(predictedBalance)}</span>
            </div>
          </div>
        </div>

        {/* ════════════════════════════════════════
           INFLOW vs OUTFLOW  +  AGING BUCKETS (side by side on lg)
           ════════════════════════════════════════ */}
        <div className="grid lg:grid-cols-2 gap-4">
          {/* Inflow vs Outflow */}
          <div className="bg-card border border-border rounded-lg">
            <div className="px-4 pt-3.5 pb-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">This Month</p>
            </div>
            <div className="border-t border-border px-4 py-3 space-y-3">
              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-emerald-600 font-medium flex items-center gap-1">
                    <TrendingUp className="h-3 w-3" /> Collections
                  </span>
                  <span className="font-semibold tabular-nums text-foreground">{formatINR(summary?.monthSales || 0)}</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-emerald-500" style={{ width: "100%" }} />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-amber-600 font-medium flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" /> Outstanding
                  </span>
                  <span className="font-semibold tabular-nums text-foreground">{formatINR(totals.outstanding)}</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-amber-500"
                    style={{ width: `${summary?.monthSales ? Math.min((totals.outstanding / summary.monthSales) * 100, 100) : 100}%` }}
                  />
                </div>
              </div>
              {summary && (
                <div className="pt-1.5 border-t border-border flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Net collected</span>
                  <span className="font-semibold tabular-nums text-foreground">
                    {formatINR(Math.max(0, (summary.monthSales || 0) - totals.outstanding))}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Aging buckets + Recovery Probability */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2.5 px-0.5">Aging & Recovery Probability</p>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(bucketLabel) as AgingBucket[]).map(bucket => {
                const b = bucketBreakdown[bucket]
                const topProb: ProbLevel = b.total > 0
                  ? (b.prob.high >= b.prob.medium && b.prob.high >= b.prob.low ? "high"
                    : b.prob.medium >= b.prob.low ? "medium" : "low")
                  : "high"
                return (
                  <div key={bucket} className="bg-card border border-border rounded-lg px-3 py-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-foreground">{bucketLabel[bucket]}</span>
                      {b.total > 0 && (
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${probColor[topProb]}`}>
                          {probLabel[topProb]}
                        </span>
                      )}
                    </div>
                    <p className="text-base font-bold tabular-nums tracking-tight text-foreground mt-0.5">
                      {b.total > 0 ? formatINR(b.total) : "—"}
                    </p>
                    {b.total > 0 && (
                      <div className="flex items-center gap-1.5 mt-1">
                        <div className="flex-1 h-1.5 rounded-full bg-muted flex overflow-hidden">
                          {(["high", "medium", "low"] as ProbLevel[]).map(p => {
                            const pct = b.total > 0 ? (b.prob[p] / b.total) * 100 : 0
                            if (pct === 0) return null
                            return (
                              <div
                                key={p}
                                className={`h-full ${p === "high" ? "bg-emerald-500" : p === "medium" ? "bg-amber-500" : "bg-red-500"}`}
                                style={{ width: `${pct}%` }}
                              />
                            )
                          })}
                        </div>
                        <span className="text-[10px] text-muted-foreground">{b.count}c</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* ════════════════════════════════════════
           MONEY MOVEMENT LEDGER
           ════════════════════════════════════════ */}
        {recentEvents.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2.5 px-0.5">
              <BarChart3 className="h-4 w-4 text-foreground" />
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Money Movement</p>
            </div>
            <div className="bg-card border border-border rounded-lg divide-y divide-border">
              {recentEvents.slice(0, 5).map((evt, i) => (
                <div key={i} className="flex items-start gap-3 px-4 py-2.5">
                  <div className={`mt-0.5 h-2 w-2 rounded-full shrink-0 ${
                    evt.eventType === "transition" ? "bg-blue-500" :
                    evt.eventType === "backfill" ? "bg-amber-500" : "bg-slate-400"
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-foreground truncate">{evt.reason}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{fmtTime(evt.occurredAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════
           CUSTOMER LIST (existing)
           ════════════════════════════════════════ */}
        <div>
          <div className="flex items-center gap-2 mb-2.5 px-0.5">
            <Users className="h-4 w-4 text-foreground" />
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Accounts Receivable Ledger</p>
          </div>

          {filtered.length === 0 ? (
            <div className="bg-card border border-border rounded-lg px-5 py-8 text-center">
              <Users className="h-8 w-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-semibold text-foreground">
                {q ? "No customers match" : "No outstanding invoices"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {q ? "Try a different search term" : "All invoices are paid — nothing needs your attention"}
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {filtered.map(group => (
                <div key={group.customerId} className="bg-card border border-border rounded-lg overflow-hidden">
                  <button
                    onClick={() => setExpandedCustomer(expandedCustomer === group.customerId ? null : group.customerId)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted transition-colors text-left"
                  >
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                      {group.customerName.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-foreground truncate">{group.customerName}</span>
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                          group.daysSinceFirstDue > 7 ? "text-red-600 bg-red-50" : "text-amber-600 bg-amber-50"
                        }`}>
                          {bucketLabel[group.agingBucket]}
                        </span>
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {group.invoiceCount} inv &middot; {group.daysSinceFirstDue}d overdue
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-semibold tabular-nums tracking-tight text-foreground">
                        {formatINR(group.totalOutstanding)}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {group.totalAmount - group.totalOutstanding > 0
                          ? `${formatINR(group.totalAmount - group.totalOutstanding)} paid`
                          : "No payments"}
                      </div>
                    </div>
                    {expandedCustomer === group.customerId
                      ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                      : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    }
                  </button>

                  {expandedCustomer === group.customerId && (
                    <div className="border-t border-border divide-y divide-border">
                      {group.invoices.map((inv: any) => (
                        <div key={inv.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted transition-colors">
                          <div className={`grid h-7 w-7 shrink-0 place-items-center rounded-md text-[10px] font-bold ${
                            inv.status === "overdue" ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-600"
                          }`}>
                            {inv.status === "overdue" ? "!" : "P"}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[11px] font-semibold text-foreground truncate">
                              {inv.id.slice(0, 8)}
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              Due {new Date(inv.dueAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} &middot; {daysSince(inv.dueAt)}d overdue
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-[11px] font-semibold tabular-nums text-foreground">{formatINR(getOutstanding(inv))}</div>
                            <div className="text-[10px] text-muted-foreground">of {formatINR(inv.total)}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                              {stageLabels[inv.recoveryStage] || inv.recoveryStage || "—"}
                            </span>
                            <button
                              onClick={e => handleSendReminder(inv, e)}
                              disabled={actingInvoice === inv.id}
                              className="p-1.5 rounded-md text-muted-foreground hover:text-muted-foreground hover:bg-muted"
                            >
                              {actingInvoice === inv.id
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                : <Send className="h-3.5 w-3.5" />
                              }
                            </button>
                          </div>
                        </div>
                      ))}
                      <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/50">
                        <button
                          onClick={() => {
                            group.invoices.forEach((inv: any) =>
                              handleSendReminder(inv, new MouseEvent("click") as unknown as React.MouseEvent))
                          }}
                          className="text-[11px] px-2.5 py-1 rounded-md bg-foreground text-background hover:bg-foreground/90 font-medium"
                        >
                          Remind all
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ════════════════════════════════════════
           FOOTER
           ════════════════════════════════════════ */}
        {summary && summary.totalCollectedToday > 0 && (
          <div className="text-center pt-1">
            <p className="text-[10px] text-muted-foreground">
              {formatINR(summary.recoveredToday)} of {formatINR(summary.totalCollectedToday)} collected today attributed to BillZo
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
