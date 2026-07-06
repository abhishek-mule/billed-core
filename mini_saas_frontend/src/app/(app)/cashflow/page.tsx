"use client"

import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ChevronDown, ChevronRight, Search, Loader2,
  Users, AlertCircle, RefreshCw, TrendingUp,
  BarChart3, Wallet, Clock, Bell, ArrowRight,
  Calendar, IndianRupee, Zap,
} from "lucide-react"
import { db } from "@/lib/billzo/db"
import { formatINR } from "@/lib/utils"
import { getCookie } from "@/lib/cookies"
import type { QueueApiSummary, QueueApiResponse, RecentEvent } from "@/lib/billzo/api-types"

// ─── Types ───────────────────────────────────────────────────────────────────

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

const probLabel: Record<ProbLevel, string> = { high: "High", medium: "Med", low: "Low" }
const probColor: Record<ProbLevel, string> = {
  high: "text-emerald-700 bg-emerald-50",
  medium: "text-amber-700 bg-amber-50",
  low: "text-rose-700 bg-rose-50",
}

const bucketBg: Record<AgingBucket, string> = {
  "1-7": "border-emerald-200 bg-emerald-50/30",
  "8-15": "border-amber-200 bg-amber-50/30",
  "16-30": "border-orange-200 bg-orange-50/30",
  "30+": "border-rose-200 bg-rose-50/30",
}
const bucketDot: Record<AgingBucket, string> = {
  "1-7": "bg-emerald-500",
  "8-15": "bg-amber-500",
  "16-30": "bg-orange-500",
  "30+": "bg-rose-500",
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

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

interface UpcomingReminder {
  invoiceId: string
  customerId: string
  customerName: string
  customerPhone: string
  invoiceNumber: string
  amount: number
  stage: string
  nextRecoveryAt: string | null
  isPending: boolean
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function CashflowPage() {
  const router = useRouter()
  const [invoices, setInvoices] = useState<any[]>([])
  const [summary, setSummary] = useState<QueueApiSummary | null>(null)
  const [recentEvents, setRecentEvents] = useState<RecentEvent[]>([])
  const [upcomingReminders, setUpcomingReminders] = useState<UpcomingReminder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState("")
  const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    try {
      setError(null)
      const tenantId = getCookie("bz_tenant")
      if (!tenantId) { router.push("/auth"); return }

      const [invData, recoveryRes, upcomingRes] = await Promise.all([
        db().invoices.where("tenantId").equals(tenantId).toArray(),
        fetch("/api/recovery/queue", { credentials: "include" }).then(r => r.ok ? r.json() : null),
        fetch("/api/recovery/upcoming", { credentials: "include" }).then(r => r.ok ? r.json() : { reminders: [] }),
      ])

      setInvoices(invData)
      setUpcomingReminders(upcomingRes?.reminders || [])

      if (recoveryRes) {
        if (recoveryRes.access === 'preview') {
          const preview = recoveryRes.data || {}
          setSummary({
            collectibleToday: 0,
            outstanding: preview.totalOverdue || 0,
            activeCases: preview.overdueCount || 0,
            recoveredToday: 0, recoveredThisWeek: 0, recoveredThisMonth: 0,
            recoveredAttributed: 0, totalCollectedToday: 0, dueToday: 0,
            queueSize: preview.overdueCount || 0, todaySales: 0, monthSales: 0,
            lowStockItems: 0, totalCustomers: 0, vipCustomers: 0,
            blockedRemindersToday: 0, stuckMoneyTotal: preview.totalOverdue || 0,
            customersNeedingAction: 0, collectedAfterFollowup: 0,
            casesResolvedThisMonth: 0, totalActions: 0, completedActions: 0,
            pendingActions: 0, promiseSummary: { dueToday: 0, overdue: 0, upcoming: 0 },
            priorityCases: [],
          } as QueueApiSummary)
          setRecentEvents([])
        } else {
          const data = recoveryRes as QueueApiResponse
          setSummary(data.summary)
          setRecentEvents(data.recentEvents || [])
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data")
    } finally {
      setLoading(false)
    }
  }

  // ── Derived state ─────────────────────────────────────────────────────────

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
    const bks: Record<AgingBucket, { count: number; total: number; prob: Record<ProbLevel, number> }> = {
      "1-7": { count: 0, total: 0, prob: { high: 0, medium: 0, low: 0 } },
      "8-15": { count: 0, total: 0, prob: { high: 0, medium: 0, low: 0 } },
      "16-30": { count: 0, total: 0, prob: { high: 0, medium: 0, low: 0 } },
      "30+": { count: 0, total: 0, prob: { high: 0, medium: 0, low: 0 } },
    }
    for (const g of groups) {
      bks[g.agingBucket].count++
      bks[g.agingBucket].total += g.totalOutstanding
      const p = recoveryProbability(g.daysSinceFirstDue, g.stage)
      bks[g.agingBucket].prob[p] += g.totalOutstanding
    }
    return bks
  }, [groups])

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

  const totals = {
    outstanding: groups.reduce((s, g) => s + g.totalOutstanding, 0),
    count: groups.reduce((s, g) => s + g.invoiceCount, 0),
    customerCount: groups.length,
  }

  const maxForecast = Math.max(...forecast.map(x => x.inflow), 1)

  const pendingReminders = upcomingReminders.filter(r => r.isPending)
  const scheduledReminders = upcomingReminders.filter(r => !r.isPending)

  // ── Loading ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-5xl mx-auto space-y-4">
        <div className="h-6 bg-muted animate-pulse rounded w-48" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
        <div className="h-20 bg-muted animate-pulse rounded-lg" />
        <div className="grid grid-cols-2 gap-3">
          {[...Array(4)].map((_, i) => (
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

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-muted/30 pb-24 lg:pb-8">
      <div className="max-w-5xl mx-auto px-4 lg:px-8 py-5 lg:py-8 space-y-5">

        {/* ══════════════════════════════════════════
            HEADER
           ══════════════════════════════════════════ */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-foreground">Cashflow</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {totals.customerCount} customers · {totals.count} invoices · {formatINR(totals.outstanding)} outstanding
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSearchOpen(!searchOpen)}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-xs font-medium text-muted-foreground bg-card hover:bg-muted"
            >
              <Search className="h-3.5 w-3.5" />
              {searchOpen ? "Close" : "Search"}
            </button>
            <button
              onClick={() => { setLoading(true); loadData() }}
              className="flex items-center justify-center w-8 h-8 border border-border rounded-lg text-muted-foreground bg-card hover:bg-muted"
              aria-label="Refresh"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {searchOpen && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search by customer name or phone…"
              className="w-full h-10 rounded-lg border border-border bg-card pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
              autoFocus
            />
          </div>
        )}

        {/* ══════════════════════════════════════════
            CASH POSITION — 4 KPIs
           ══════════════════════════════════════════ */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 pt-3.5 pb-2.5 border-b border-border">
            <Wallet className="h-4 w-4 text-foreground" />
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Cash Position</p>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-border">
            <div className="px-4 py-3">
              <p className="text-[11px] text-muted-foreground font-medium">Collected Today</p>
              <p className="text-xl font-bold tabular-nums tracking-tight text-emerald-600 mt-0.5">
                {formatINR(summary?.totalCollectedToday || 0)}
              </p>
              <p className="text-[10px] text-emerald-600 mt-0.5 flex items-center gap-0.5">
                <TrendingUp className="h-3 w-3" /> via payments
              </p>
            </div>
            <div className="px-4 py-3">
              <p className="text-[11px] text-muted-foreground font-medium">Outstanding (AR)</p>
              <p className="text-xl font-bold tabular-nums tracking-tight text-foreground mt-0.5">
                {formatINR(totals.outstanding)}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{totals.customerCount} customers owed</p>
            </div>
            <div className="px-4 py-3">
              <p className="text-[11px] text-muted-foreground font-medium">This Month Sales</p>
              <p className="text-xl font-bold tabular-nums tracking-tight text-foreground mt-0.5">
                {formatINR(summary?.monthSales || 0)}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">invoiced total</p>
            </div>
            <div className="px-4 py-3">
              <p className="text-[11px] text-muted-foreground font-medium">Collection Rate</p>
              <p className="text-xl font-bold tabular-nums tracking-tight text-foreground mt-0.5">
                {summary?.monthSales
                  ? Math.round(((summary.monthSales - totals.outstanding) / summary.monthSales) * 100)
                  : 0}%
              </p>
              <div className="mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{
                    width: `${summary?.monthSales
                      ? Math.min(((summary.monthSales - totals.outstanding) / summary.monthSales) * 100, 100)
                      : 0}%`
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════
            7-DAY FORECAST + THIS MONTH BREAKDOWN
           ══════════════════════════════════════════ */}
        <div className="grid lg:grid-cols-2 gap-4">

          {/* 7-day forecast */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 px-4 pt-3.5 pb-2.5 border-b border-border">
              <Calendar className="h-4 w-4 text-foreground" />
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">7-Day Forecast</p>
            </div>
            <div className="px-4 py-3.5">
              <div className="grid grid-cols-7 gap-1">
                {forecast.map((d, i) => (
                  <div key={i} className="text-center">
                    <p className="text-[10px] text-muted-foreground font-medium">{d.label}</p>
                    <p className="text-[11px] font-semibold tabular-nums text-foreground mt-1">
                      {d.inflow > 0 ? formatINR(d.inflow) : "—"}
                    </p>
                    <div className="mt-1.5 h-1 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-foreground/70 transition-all"
                        style={{ width: `${Math.min((d.inflow / maxForecast) * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 pt-2.5 border-t border-border flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Expected this week</span>
                <span className="font-semibold tabular-nums">
                  {formatINR(forecast.reduce((s, d) => s + d.inflow, 0))}
                </span>
              </div>
            </div>
          </div>

          {/* Monthly breakdown */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 px-4 pt-3.5 pb-2.5 border-b border-border">
              <BarChart3 className="h-4 w-4 text-foreground" />
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">This Month</p>
            </div>
            <div className="px-4 py-3 space-y-3">
              {[
                { label: "Collected", value: Math.max(0, (summary?.monthSales || 0) - totals.outstanding), cls: "bg-emerald-500", color: "text-emerald-600" },
                { label: "Outstanding", value: totals.outstanding, cls: "bg-amber-500", color: "text-amber-600" },
                { label: "Overdue >15d", value: bucketBreakdown["16-30"].total + bucketBreakdown["30+"].total, cls: "bg-rose-500", color: "text-rose-600" },
              ].map(b => {
                const base = summary?.monthSales || totals.outstanding || 1
                const pct = Math.min((b.value / base) * 100, 100)
                return (
                  <div key={b.label}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className={`font-medium ${b.color}`}>{b.label}</span>
                      <span className="font-semibold tabular-nums text-foreground">{formatINR(b.value)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className={`h-full rounded-full ${b.cls}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════
            AGING BUCKETS (4 tiles)
           ══════════════════════════════════════════ */}
        <div>
          <div className="flex items-center gap-2 mb-3 px-0.5">
            <IndianRupee className="h-4 w-4 text-foreground" />
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Aging & Recovery Probability</p>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {(Object.keys(bucketLabel) as AgingBucket[]).map(bucket => {
              const b = bucketBreakdown[bucket]
              const topProb: ProbLevel = b.total > 0
                ? (b.prob.high >= b.prob.medium && b.prob.high >= b.prob.low ? "high"
                  : b.prob.medium >= b.prob.low ? "medium" : "low")
                : "high"
              return (
                <div key={bucket} className={`border rounded-xl px-3.5 py-3 ${bucketBg[bucket]}`}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${bucketDot[bucket]}`} />
                      <span className="text-[11px] font-semibold text-foreground">{bucketLabel[bucket]}</span>
                    </div>
                    {b.total > 0 && (
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${probColor[topProb]}`}>
                        {probLabel[topProb]}
                      </span>
                    )}
                  </div>
                  <p className="text-base font-bold tabular-nums tracking-tight text-foreground">
                    {b.total > 0 ? formatINR(b.total) : "—"}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{b.count} customers</p>
                  {b.total > 0 && (
                    <div className="mt-2 h-1 rounded-full bg-white/50 flex overflow-hidden">
                      {(["high", "medium", "low"] as ProbLevel[]).map(p => {
                        const pct = b.total > 0 ? (b.prob[p] / b.total) * 100 : 0
                        if (pct === 0) return null
                        return (
                          <div
                            key={p}
                            className={`h-full ${p === "high" ? "bg-emerald-500" : p === "medium" ? "bg-amber-500" : "bg-rose-500"}`}
                            style={{ width: `${pct}%` }}
                          />
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* ══════════════════════════════════════════
            UPCOMING REMINDERS (Auto-scheduled)
           ══════════════════════════════════════════ */}
        {upcomingReminders.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3 px-0.5">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-foreground" />
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Reminders</p>
                {pendingReminders.length > 0 && (
                  <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full">
                    {pendingReminders.length} pending
                  </span>
                )}
              </div>
            </div>
            <div className="bg-card border border-border rounded-xl divide-y divide-border overflow-hidden">
              {upcomingReminders.slice(0, 8).map((r, i) => (
                <Link
                  key={i}
                  href={`/invoices/${r.invoiceId}`}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted transition-colors group"
                >
                  <div className={`h-2 w-2 rounded-full shrink-0 ${r.isPending ? "bg-amber-500" : "bg-slate-300"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-foreground truncate">{r.customerName}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {formatINR(r.amount)} · {r.stage}
                      {r.nextRecoveryAt && ` · due ${new Date(r.nextRecoveryAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`}
                    </p>
                  </div>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${
                    r.isPending ? "bg-amber-50 text-amber-700" : "bg-slate-50 text-slate-500"
                  }`}>
                    {r.isPending ? "Pending" : "Scheduled"}
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
              ))}
              {upcomingReminders.length > 8 && (
                <div className="px-4 py-2.5 text-[11px] text-muted-foreground text-center">
                  +{upcomingReminders.length - 8} more scheduled reminders
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════
            MONEY MOVEMENT (Activity)
           ══════════════════════════════════════════ */}
        {recentEvents.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3 px-0.5">
              <Zap className="h-4 w-4 text-foreground" />
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recent Activity</p>
            </div>
            <div className="bg-card border border-border rounded-xl divide-y divide-border overflow-hidden">
              {recentEvents.slice(0, 6).map((evt, i) => (
                <div key={i} className="flex items-start gap-3 px-4 py-2.5">
                  <div className={`mt-0.5 h-2 w-2 rounded-full shrink-0 ${
                    evt.eventType === "transition" ? "bg-blue-500" :
                    evt.eventType === "backfill" ? "bg-amber-500" : "bg-slate-300"
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

        {/* ══════════════════════════════════════════
            ACCOUNTS RECEIVABLE LEDGER
           ══════════════════════════════════════════ */}
        <div>
          <div className="flex items-center gap-2 mb-3 px-0.5">
            <Users className="h-4 w-4 text-foreground" />
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Accounts Receivable</p>
          </div>

          {filtered.length === 0 ? (
            <div className="bg-card border border-border rounded-xl px-5 py-10 text-center">
              <Users className="h-8 w-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-semibold text-foreground">
                {q ? "No customers match" : "No outstanding invoices"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {q ? "Try a different search term" : "All invoices are paid — nothing needs attention"}
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {filtered.map(group => (
                <div key={group.customerId} className="bg-card border border-border rounded-xl overflow-hidden">
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
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                          group.daysSinceFirstDue > 15
                            ? "text-rose-700 bg-rose-50"
                            : group.daysSinceFirstDue > 7
                            ? "text-amber-700 bg-amber-50"
                            : "text-emerald-700 bg-emerald-50"
                        }`}>
                          {bucketLabel[group.agingBucket]}
                        </span>
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {group.invoiceCount} invoice{group.invoiceCount !== 1 ? "s" : ""} · {group.daysSinceFirstDue}d overdue
                      </div>
                    </div>
                    <div className="text-right shrink-0 mr-1">
                      <div className="text-sm font-bold tabular-nums tracking-tight text-foreground">
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
                      {group.invoices.map((inv: any) => {
                        const outstanding = getOutstanding(inv)
                        return (
                          <Link
                            key={inv.id}
                            href={`/invoices/${inv.id}`}
                            className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted transition-colors group"
                          >
                            <div className={`grid h-7 w-7 shrink-0 place-items-center rounded-md text-[10px] font-bold ${
                              inv.status === "overdue" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"
                            }`}>
                              {inv.status === "overdue" ? "!" : "P"}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-[11px] font-semibold text-foreground truncate">
                                {inv.invoiceNumber || inv.id.slice(0, 8)}
                              </div>
                              <div className="text-[10px] text-muted-foreground">
                                {new Date(inv.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                                {inv.dueAt && ` · due ${new Date(inv.dueAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`}
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <div className="text-xs font-semibold tabular-nums text-foreground">
                                {formatINR(outstanding)}
                              </div>
                              {outstanding < inv.total && (
                                <div className="text-[10px] text-muted-foreground">
                                  of {formatINR(inv.total)}
                                </div>
                              )}
                            </div>
                            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </Link>
                        )
                      })}
                      {/* Record payment CTA — links to the invoice detail page where payment is recorded */}
                      <Link
                        href={`/invoices/${group.invoices[0]?.id}`}
                        className="flex items-center gap-2 px-4 py-2.5 text-xs text-primary font-medium hover:bg-primary/5 transition-colors"
                      >
                        <IndianRupee className="h-3.5 w-3.5" />
                        Record payment for {group.customerName}
                        <ArrowRight className="h-3 w-3 ml-auto" />
                      </Link>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
