"use client"

import { useState, useEffect, useMemo, type ReactNode } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ChevronDown, ChevronRight, Search, Users, RefreshCw, TrendingUp,
  BarChart3, Bell, ArrowRight, Calendar, IndianRupee, Zap,
  Banknote, Clock,
} from "lucide-react"
import { db } from "@/lib/billzo/db"
import { formatINR } from "@/lib/utils"
import { getCookie } from "@/lib/cookies"
import type { QueueApiSummary, QueueApiResponse } from "@/lib/billzo/api-types"
import { ErrorState } from "@/components/billzo/ErrorState"
import { getErrorMessage } from "@/lib/billzo/ui-errors"
import { getDiceBearAvatarUrl } from "@/components/billzo/Avatar"
import { getCollectionRisk, COLLECTION_RISK_TONE_CLASSES, type CollectionRiskTone } from "@/lib/billzo/recovery-risk"

// ─── Types & design tokens ───────────────────────────────────────────────────

type AgingBucket = "1-7" | "8-15" | "16-30" | "30+"

const bucketLabel: Record<AgingBucket, string> = {
  "1-7": "1–7 days",
  "8-15": "8–15 days",
  "16-30": "16–30 days",
  "30+": "30+ days",
}

type ProbLevel = "high" | "medium" | "low"

/** Map an aging bucket's representative overdue-days to a recovery probability. */
function recoveryProbability(days: number, _stage?: string): ProbLevel {
  const risk = getCollectionRisk({ overdueDays: days })
  if (risk.rank <= 1) return "high"
  if (risk.rank <= 2) return "medium"
  return "low"
}

const probLabel: Record<ProbLevel, string> = { high: "High", medium: "Medium", low: "Low" }

/** Probability badge colors keyed on CollectionRisk tone. */
const probColor: Record<ProbLevel, string> = {
  high: `${COLLECTION_RISK_TONE_CLASSES.success.text} ${COLLECTION_RISK_TONE_CLASSES.success.bg}`,
  medium: `${COLLECTION_RISK_TONE_CLASSES.warning.text} ${COLLECTION_RISK_TONE_CLASSES.warning.bg}`,
  low: `${COLLECTION_RISK_TONE_CLASSES.danger.text} ${COLLECTION_RISK_TONE_CLASSES.danger.bg}`,
}

/** Each aging bucket's representative tone, derived from CollectionRisk. */
const BUCKET_TONE: Record<AgingBucket, CollectionRiskTone> = {
  "1-7": "success",
  "8-15": "warning",
  "16-30": "warning",
  "30+": "danger",
}

/** Aging tile surface — soft tint over the card, design-system tokens only. */
const bucketTile: Record<AgingBucket, string> = {
  "1-7": "border-border bg-gradient-to-br from-success-soft/80 to-card",
  "8-15": "border-border bg-gradient-to-br from-warning-soft/80 to-card",
  "16-30": "border-border bg-gradient-to-br from-warning-soft/80 to-card",
  "30+": "border-border bg-gradient-to-br from-danger-soft/80 to-card",
}
const bucketDot: Record<AgingBucket, string> = {
  "1-7": COLLECTION_RISK_TONE_CLASSES.success.dot,
  "8-15": COLLECTION_RISK_TONE_CLASSES.warning.dot,
  "16-30": COLLECTION_RISK_TONE_CLASSES.warning.dot,
  "30+": COLLECTION_RISK_TONE_CLASSES.danger.dot,
}

/** Aging badge on AR ledger rows — soft fill + matching border. */
const AGING_BADGE: Record<AgingBucket, string> = {
  "1-7": "bg-success-soft text-success border-success/30",
  "8-15": "bg-warning-soft text-warning border-warning/30",
  "16-30": "bg-warning-soft text-warning border-warning/30",
  "30+": "bg-danger-soft text-danger border-danger/30",
}

/** Left-accent color used on AR ledger cards, keyed by aging urgency. */
const bucketAccent: Record<AgingBucket, string> = {
  "1-7": "border-l-success",
  "8-15": "border-l-warning",
  "16-30": "border-l-warning",
  "30+": "border-l-danger",
}

// Indexed by Date#getDay(): 0 = Sunday … 6 = Saturday.
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

function daysSince(dateStr?: string | null): number {
  if (!dateStr) return 0
  const t = new Date(dateStr).getTime()
  if (isNaN(t)) return 0
  return Math.floor((Date.now() - t) / (1000 * 60 * 60 * 24))
}

function getAgingBucket(days: number): AgingBucket {
  if (days <= 7) return "1-7"
  if (days <= 15) return "8-15"
  if (days <= 30) return "16-30"
  return "30+"
}

function getOutstanding(inv: any): number {
  const raw = inv.outstanding_amount ?? inv.outstandingAmount ?? inv.outstanding_amount
  if (raw != null && Number(raw) >= 0) {
    const v = Number(raw)
    if (!isNaN(v)) return Math.max(0, v)
  }
  const t = Number(inv.grand_total ?? inv.total ?? 0)
  const p = Number(inv.paid_amount ?? inv.paidAmount ?? 0)
  return Math.max(0, t - p)
}

/** Compact ₹ figure for tight chart columns — exact value stays in tooltips/sums. */
function compactINR(v: number): string {
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(v >= 100000000 ? 0 : 1)}Cr`
  if (v >= 100000) return `₹${(v / 100000).toFixed(v >= 1000000 ? 0 : 1)}L`
  if (v >= 1000) return `₹${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k`
  return `₹${Math.round(v)}`
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

/** Icon-chip + uppercase label used as a card/section header. */
function SectionHeader({ icon: Icon, label, right }: {
  icon: typeof Bell
  label: string
  right?: ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Icon size={15} />
        </span>
        <span className="uppercase tracking-wider font-semibold">{label}</span>
      </div>
      {right}
    </div>
  )
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function CashflowPage() {
  const router = useRouter()
  const [invoices, setInvoices] = useState<any[]>([])
  const [summary, setSummary] = useState<QueueApiSummary | null>(null)
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
        } else {
          const data = recoveryRes as QueueApiResponse
          setSummary(data.summary)
        }
      }
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load data"))
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

  const todayCollected = summary?.totalCollectedToday || 0

  const collectionRate = (() => {
    if (!summary?.monthSales || summary.monthSales <= 0) return { pct: null as number | null, collected: 0 }
    const collected = Math.max(0, summary.monthSales - totals.outstanding)
    return { pct: Math.min(100, Math.round((collected / summary.monthSales) * 100)), collected }
  })()

  const maxForecast = Math.max(...forecast.map(x => x.inflow), 1)

  const pendingReminders = upcomingReminders.filter(r => r.isPending)

  // ── Loading ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="bg-muted/50 pb-24 lg:pb-8">
        <div className="max-w-5xl mx-auto px-4 lg:px-8 py-5 lg:py-8 space-y-4 animate-pulse">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <div className="h-7 w-32 bg-muted rounded-lg" />
              <div className="h-3.5 w-64 bg-muted rounded" />
            </div>
            <div className="flex gap-2 pt-1">
              <div className="h-8 w-20 bg-muted rounded-full" />
              <div className="h-8 w-8 bg-muted rounded-full" />
            </div>
          </div>
          <div className="h-44 rounded-3xl bg-card border border-border" />
          <div className="grid lg:grid-cols-2 gap-4">
            <div className="h-48 rounded-2xl bg-card border border-border" />
            <div className="h-48 rounded-2xl bg-card border border-border" />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 rounded-2xl bg-card border border-border" />
            ))}
          </div>
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-16 rounded-2xl bg-card border border-border" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-muted/50 pb-24 lg:pb-8">
        <div className="max-w-5xl mx-auto px-4 lg:px-8 py-5 lg:py-8">
          <ErrorState severity="error" message={error} onRetry={() => { setError(null); setLoading(true); loadData() }} />
        </div>
      </div>
    )
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="bg-muted/50 pb-24 lg:pb-8">
      <div className="max-w-5xl mx-auto px-4 lg:px-8 py-5 lg:py-8 space-y-4">

        {/* ══════════════════════════════════════════
            HEADER
           ══════════════════════════════════════════ */}
        <div className="animate-element flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Cashflow</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {totals.customerCount} customers · {totals.count} open invoice{totals.count !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={() => setSearchOpen(!searchOpen)}
              aria-expanded={searchOpen}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-full text-xs font-semibold text-muted-foreground bg-card hover:bg-muted hover:text-foreground transition-colors"
            >
              <Search className="h-3.5 w-3.5" />
              {searchOpen ? "Close" : "Search"}
            </button>
            <button
              onClick={() => { setLoading(true); loadData() }}
              className="inline-flex h-8 w-8 items-center justify-center border border-border rounded-full text-muted-foreground bg-card hover:bg-muted transition-colors"
              aria-label="Refresh"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {searchOpen && (
          <div className="animate-element relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search by customer name or phone…"
              className="w-full py-2.5 pl-10 pr-4 bg-card border border-border rounded-2xl text-sm text-foreground placeholder:text-muted-foreground shadow-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-all"
              autoFocus
            />
          </div>
        )}

        {/* ══════════════════════════════════════════
            CASH POSITION — hero + supporting KPIs
           ══════════════════════════════════════════ */}
        <section className="animate-element animate-delay-100 relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/[0.12] via-card to-card p-5 lg:p-6">
          <div className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full bg-primary/10 blur-2xl" />
          <div className="relative">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="grid h-7 w-7 place-items-center rounded-xl bg-primary/10 text-primary">
                <Banknote size={15} />
              </span>
              <span className="uppercase tracking-wider font-semibold">Cash Position</span>
            </div>
            <p
              className="mt-2 text-3xl lg:text-4xl font-bold tabular-nums tracking-tight text-foreground"
              title={`${formatINR(totals.outstanding)} outstanding`}
            >
              {formatINR(totals.outstanding)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Outstanding (AR) · {totals.customerCount} customers owed
            </p>

            <div className="mt-4 pt-4 border-t border-border/60 grid grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-4">
              <div>
                <p className="text-[11px] font-medium text-muted-foreground">Collected Today</p>
                <p className={`mt-0.5 text-lg font-bold tabular-nums tracking-tight ${todayCollected > 0 ? "text-success" : "text-foreground"}`}>
                  {formatINR(todayCollected)}
                </p>
                <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                  {todayCollected > 0
                    ? <><TrendingUp className="h-3 w-3 text-success" /> Payments received</>
                    : "No payments recorded yet today"}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-medium text-muted-foreground">This Month Sales</p>
                <p className="mt-0.5 text-lg font-bold tabular-nums tracking-tight text-foreground">
                  {formatINR(summary?.monthSales || 0)}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">invoiced total</p>
              </div>
              <div className="col-span-2 lg:col-span-1">
                <p className="text-[11px] font-medium text-muted-foreground">Collection Rate</p>
                <p className="mt-0.5 text-lg font-bold tabular-nums tracking-tight text-foreground">
                  {collectionRate.pct != null ? `${collectionRate.pct}%` : "—"}
                </p>
                <div className="mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${collectionRate.pct != null ? "bg-success" : "bg-foreground/10"}`}
                    style={{ width: `${collectionRate.pct ?? 0}%` }}
                  />
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {collectionRate.pct != null
                    ? `${formatINR(collectionRate.collected)} collected of ${formatINR(summary?.monthSales || 0)} billed`
                    : "Not billed this month yet"}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════
            7-DAY FORECAST + THIS MONTH BREAKDOWN
           ══════════════════════════════════════════ */}
        <div className="animate-element animate-delay-200 grid lg:grid-cols-2 gap-4">

          {/* 7-day forecast */}
          <section className="bg-card border border-border rounded-2xl p-5">
            <SectionHeader
              icon={Calendar}
              label="7-Day Forecast"
              right={<span className="text-[11px] font-medium text-muted-foreground">Invoices due</span>}
            />
            <div className="mt-4 grid grid-cols-7 gap-1">
              {forecast.map((d, i) => {
                const pct = d.inflow > 0 ? Math.max(12, Math.min((d.inflow / maxForecast) * 100, 100)) : 8
                return (
                  <div key={i} className="flex flex-col items-center gap-1.5">
                    <span
                      title={d.inflow > 0 ? formatINR(d.inflow) : undefined}
                      className={`h-3.5 text-[10px] font-semibold tabular-nums leading-none whitespace-nowrap ${d.inflow > 0 ? "text-success" : "text-muted-foreground/50"}`}
                    >
                      {d.inflow > 0 ? compactINR(d.inflow) : "—"}
                    </span>
                    <div className={`flex h-16 w-full max-w-[28px] items-end rounded-full p-0.5 ${i === 0 ? "bg-primary/10" : "bg-muted/50"}`}>
                      <div
                        className={`w-full rounded-full transition-all ${d.inflow > 0 ? "bg-gradient-to-t from-success/70 to-success" : "bg-foreground/10"}`}
                        style={{ height: `${pct}%` }}
                      />
                    </div>
                    <span className={`text-[10px] font-semibold ${i === 0 ? "text-foreground" : "text-muted-foreground"}`}>
                      {d.label}
                    </span>
                  </div>
                )
              })}
            </div>
            <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Expected this week</span>
              <span className="font-semibold tabular-nums text-foreground">
                {formatINR(forecast.reduce((s, d) => s + d.inflow, 0))}
              </span>
            </div>
          </section>

          {/* Monthly breakdown */}
          <section className="bg-card border border-border rounded-2xl p-5">
            <SectionHeader icon={BarChart3} label="This Month" />
            <div className="mt-4 space-y-3.5">
              {[
                { label: "Collected", value: Math.max(0, (summary?.monthSales || 0) - totals.outstanding), bar: "bg-success", dot: "bg-success" },
                { label: "Outstanding", value: totals.outstanding, bar: "bg-warning", dot: "bg-warning" },
                { label: "Overdue >15d", value: bucketBreakdown["16-30"].total + bucketBreakdown["30+"].total, bar: "bg-danger", dot: "bg-danger" },
              ].map(b => {
                const base = summary?.monthSales || totals.outstanding || 1
                const pct = Math.min((b.value / base) * 100, 100)
                return (
                  <div key={b.label}>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="flex items-center gap-1.5 font-medium text-foreground">
                        <span className={`h-2 w-2 rounded-full ${b.dot}`} />
                        {b.label}
                      </span>
                      <span className="font-semibold tabular-nums text-foreground">{formatINR(b.value)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${b.bar}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        </div>

        {/* ══════════════════════════════════════════
            AGING BUCKETS (4 tiles)
           ══════════════════════════════════════════ */}
        <section className="animate-element animate-delay-300">
          <div className="flex items-center gap-2 mb-2.5 px-1 text-muted-foreground">
            <span className="grid h-7 w-7 place-items-center rounded-xl bg-primary/10 text-primary">
              <IndianRupee size={15} />
            </span>
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
                <div key={bucket} className={`rounded-2xl border p-4 ${bucketTile[bucket]}`}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${bucketDot[bucket]}`} />
                      <span className="text-[11px] font-semibold text-foreground">{bucketLabel[bucket]}</span>
                    </div>
                    {b.total > 0 && (
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${probColor[topProb]}`}>
                        {probLabel[topProb]}
                      </span>
                    )}
                  </div>
                  <p className="text-xl font-bold tabular-nums tracking-tight text-foreground">
                    {b.total > 0 ? formatINR(b.total) : "—"}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{b.count} customers</p>
                  {b.total > 0 && (
                    <div className="mt-2.5 pt-2 border-t border-border/70">
                      <div className="flex items-center justify-between text-[10px] mb-1">
                        <span className="text-muted-foreground">Share of outstanding</span>
                        <span className="tabular-nums text-muted-foreground font-medium">
                          {Math.max(0, Math.round((b.total / (totals.outstanding || 1)) * 100))}%
                        </span>
                      </div>
                      <div className="h-1 rounded-full bg-muted/70 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${COLLECTION_RISK_TONE_CLASSES[BUCKET_TONE[bucket]].dot}`}
                          style={{ width: `${Math.min((b.total / (totals.outstanding || 1)) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>

        {/* ══════════════════════════════════════════
            UPCOMING REMINDERS (Auto-scheduled)
           ══════════════════════════════════════════ */}
        {upcomingReminders.length > 0 && (
          <section className="animate-element animate-delay-300">
            <div className="flex items-center justify-between px-1 mb-2.5">
              <div className="flex items-center gap-2 text-muted-foreground">
                <span className="grid h-7 w-7 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Bell size={15} />
                </span>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Reminders</p>
                {pendingReminders.length > 0 && (
                  <span className="text-[10px] font-semibold text-warning bg-warning-soft px-2 py-0.5 rounded-full">
                    {pendingReminders.length} pending
                  </span>
                )}
              </div>
              <span className="text-[11px] text-muted-foreground">{upcomingReminders.length} upcoming</span>
            </div>
            <div className="bg-card border border-border rounded-2xl divide-y divide-border overflow-hidden shadow-sm">
              {upcomingReminders.slice(0, 8).map((r, i) => (
                <Link
                  key={i}
                  href={`/invoices/${r.invoiceId}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-muted/60 transition-colors group"
                >
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${r.isPending ? "bg-warning-soft text-warning" : "bg-muted text-muted-foreground"}`}>
                    {r.isPending ? <Bell size={15} /> : <Clock size={15} />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-foreground truncate">{r.customerName}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {formatINR(r.amount)}
                      {r.invoiceNumber ? <> · Inv #{r.invoiceNumber}</> : null}
                      {r.nextRecoveryAt && ` · due ${new Date(r.nextRecoveryAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`}
                    </p>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0 border ${
                    r.isPending
                      ? "bg-warning-soft text-warning border-warning/30"
                      : "bg-muted text-muted-foreground border-border"
                  }`}>
                    {r.isPending ? "Pending" : "Scheduled"}
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                </Link>
              ))}
              {upcomingReminders.length > 8 && (
                <div className="px-4 py-2.5 text-[11px] text-muted-foreground text-center">
                  +{upcomingReminders.length - 8} more scheduled reminders
                </div>
              )}
            </div>
          </section>
        )}

        {/* ══════════════════════════════════════════
            ACTIVITY — link to the full feed
           ══════════════════════════════════════════ */}
        <Link
          href="/recovery/timeline"
          className="animate-element animate-delay-300 flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-card border border-border hover:border-primary/40 hover:shadow-sm transition-all group"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <Zap className="h-4 w-4" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-foreground">What happened recently in your business?</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Payments, reminders, promises and customer replies.</p>
          </div>
          <span className="text-[11px] font-medium text-primary shrink-0 flex items-center gap-0.5">
            View activity
            <ArrowRight className="h-3 w-3" />
          </span>
        </Link>

        {/* ══════════════════════════════════════════
            ACCOUNTS RECEIVABLE LEDGER
           ══════════════════════════════════════════ */}
        <section className="animate-element animate-delay-400">
          <div className="flex items-center justify-between px-1 mb-2.5">
            <div className="flex items-center gap-2 text-muted-foreground">
              <span className="grid h-7 w-7 place-items-center rounded-xl bg-primary/10 text-primary">
                <Users size={15} />
              </span>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Accounts Receivable</p>
            </div>
            {filtered.length > 0 && (
              <span className="text-[11px] font-medium text-muted-foreground">
                {filtered.length} {filtered.length === 1 ? "customer" : "customers"}
              </span>
            )}
          </div>

          {filtered.length === 0 ? (
            <div className="bg-card border border-border rounded-2xl px-5 py-12 text-center">
              <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
                <Users className="h-5 w-5" />
              </div>
              <p className="text-sm font-semibold text-foreground">
                {q ? "No customers match" : "No outstanding invoices"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {q ? "Try a different search term" : "All invoices are paid — nothing needs attention"}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(group => {
                const expanded = expandedCustomer === group.customerId
                return (
                  <div
                    key={group.customerId}
                    className={`bg-card border border-l-[3px] rounded-2xl overflow-hidden shadow-sm transition-all ${bucketAccent[group.agingBucket]} border-border`}
                  >
                    <button
                      onClick={() => setExpandedCustomer(expanded ? null : group.customerId)}
                      aria-expanded={expanded}
                      className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-muted/60 transition-colors text-left group"
                    >
                      <img
                        src={getDiceBearAvatarUrl(group.customerName)}
                        alt=""
                        className="h-10 w-10 shrink-0 rounded-full bg-muted/20"
                        loading="lazy"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-foreground truncate">{group.customerName}</span>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${AGING_BADGE[group.agingBucket]}`}>
                            {bucketLabel[group.agingBucket]}
                          </span>
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          {group.invoiceCount} invoice{group.invoiceCount !== 1 ? "s" : ""}
                          {group.daysSinceFirstDue > 0
                            ? ` · ${group.daysSinceFirstDue}d overdue`
                            : group.daysSinceFirstDue === 0
                            ? " · due today"
                            : ` · due in ${-group.daysSinceFirstDue}d`}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-bold tabular-nums tracking-tight text-foreground">
                          {formatINR(group.totalOutstanding)}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {group.totalAmount - group.totalOutstanding > 0
                            ? `${formatINR(group.totalAmount - group.totalOutstanding)} paid`
                            : "No payments"}
                        </div>
                      </div>
                      {expanded
                        ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 group-hover:text-primary transition-colors" />
                        : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                      }
                    </button>

                    {expanded && (
                      <div className="border-t border-border bg-muted/20 divide-y divide-border">
                        {group.invoices.map((inv: any) => {
                          const outstanding = getOutstanding(inv)
                          const invDate = (s?: string) => {
                            const d = s ? new Date(s) : new Date()
                            return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
                          }
                          return (
                            <Link
                              key={inv.id}
                              href={`/invoices/${inv.id}`}
                              className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/60 transition-colors group"
                            >
                              <div className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[10px] font-bold ${
                                inv.status === "overdue"
                                  ? "bg-danger-soft text-danger"
                                  : inv.status === "partial"
                                  ? "bg-warning-soft text-warning"
                                  : "bg-info-soft text-info"
                              }`}>
                                {inv.status === "overdue" ? "!" : inv.status === "partial" ? "P" : "U"}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-[11px] font-semibold text-foreground truncate">
                                  {inv.invoiceNumber || inv.id.slice(0, 8)}
                                </div>
                                <div className="text-[10px] text-muted-foreground">
                                  Billed {invDate(inv.createdAt)}
                                  {inv.dueAt && <> · due {invDate(inv.dueAt)}</>}
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <div className={`text-xs font-semibold tabular-nums ${inv.status === "overdue" ? "text-danger" : "text-foreground"}`}>
                                  {formatINR(outstanding)}
                                </div>
                                {outstanding < inv.total && (
                                  <div className="text-[10px] text-muted-foreground">
                                    of {formatINR(inv.total)}
                                  </div>
                                )}
                              </div>
                              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 group-hover:text-primary transition-all" />
                            </Link>
                          )
                        })}
                        {/* Record payment CTA — links to the invoice detail page where payment is recorded */}
                        <Link
                          href={`/invoices/${group.invoices[0]?.id}`}
                          className="flex items-center gap-2 px-4 py-2.5 text-xs text-primary font-semibold hover:bg-primary/5 transition-colors"
                        >
                          <IndianRupee className="h-3.5 w-3.5" />
                          Record payment for {group.customerName}
                          <ArrowRight className="h-3 w-3 ml-auto" />
                        </Link>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>

      </div>
    </div>
  )
}
