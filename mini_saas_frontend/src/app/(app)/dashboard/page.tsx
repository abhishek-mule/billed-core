"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import Link from "next/link"
import {
  Send, IndianRupee, CheckCircle2, Loader2,
  AlertCircle, Plus,
  TrendingUp, UserPlus, FileText,
  MessageSquare, Activity, RefreshCw,
} from "lucide-react"
import { formatINR } from "@/lib/utils"
import type { QueueApiItem, QueueApiSummary, QueueApiResponse, RecentEvent } from "@/lib/billzo/api-types"
import type { Invoice } from "@/lib/billzo/types"
import { db } from "@/lib/billzo/db"
import { getCookie } from "@/lib/cookies"

type HydrationState = 'idle' | 'loading' | 'hydrated' | 'error'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getEventIcon(evt: RecentEvent) {
  const reason = evt.reason.toLowerCase()
  if (reason.includes('payment') || reason.includes('collected')) return { icon: IndianRupee, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-950' }
  if (reason.includes('whatsapp') || reason.includes('reminder')) return { icon: MessageSquare, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-950' }
  if (reason.includes('invoice') || reason.includes('created')) return { icon: FileText, color: 'text-indigo-500', bg: 'bg-indigo-50 dark:bg-indigo-950' }
  if (reason.includes('recovery') || reason.includes('recovered')) return { icon: TrendingUp, color: 'text-violet-500', bg: 'bg-violet-50 dark:bg-violet-950' }
  return { icon: Activity, color: 'text-muted-foreground', bg: 'bg-muted' }
}

function formatDate() {
  const d = new Date()
  const opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }
  return d.toLocaleDateString('en-IN', opts)
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
}

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return "Good Morning"
  if (h < 17) return "Good Afternoon"
  return "Good Evening"
}

// ─── Structured Loading Skeleton ─────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6 pb-40 lg:pb-12">
      <div className="h-7 w-48 bg-muted rounded animate-pulse" />
      <div className="h-16 bg-muted rounded-xl animate-pulse" />
      <div className="h-48 bg-muted rounded-2xl animate-pulse" />
      <div className="space-y-3">
        <div className="h-4 w-32 bg-muted rounded animate-pulse" />
        <div className="h-28 bg-muted rounded-xl animate-pulse" />
      </div>
      <div className="h-16 bg-muted rounded-xl animate-pulse" />
      <div className="grid grid-cols-4 gap-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-12 bg-muted rounded-lg animate-pulse" />
        ))}
      </div>
      <div className="h-24 bg-muted rounded-xl animate-pulse" />
    </div>
  )
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function BillZoHome() {
  const [hydration, setHydration] = useState<HydrationState>('idle')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<QueueApiSummary | null>(null)
  const [items, setItems] = useState<QueueApiItem[]>([])
  const [recentEvents, setRecentEvents] = useState<RecentEvent[]>([])
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [shopName, setShopName] = useState("")
  const [userName, setUserName] = useState("")

  const retryCountRef = useRef(0)
  const maxRetries = 3

  const loadQueue = useCallback(async (isBackground = false) => {
    if (!isBackground) {
      setHydration('loading')
    } else {
      setIsRefreshing(true)
    }
    setError(null)

    try {
      const res = await fetch("/api/recovery/queue", { credentials: "include" })
      if (!res.ok) throw new Error(`API error: ${res.status}`)
      const data = await res.json()
      retryCountRef.current = 0

      // Handle both full response and preview response for starter plan
      if (data.access === 'preview') {
        // Preview response structure: { access: 'preview', data: { totalOverdue, overdueCount, oldestDueDays, samples } }
        const preview = data.data || {}
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
          totalActions: 0,
          completedActions: 0,
          pendingActions: 0,
          promiseSummary: { dueToday: 0, overdue: 0, upcoming: 0 },
          priorityCases: [],
        } as QueueApiSummary)
        setItems([])
        setRecentEvents([])
      } else {
        // Full response structure: { items, summary, recentEvents, access: 'full' }
        setSummary(data.summary)
        setItems(data.items)
        setRecentEvents(data.recentEvents || [])
      }
      setHydration('hydrated')
      setIsRefreshing(false)

      // Non-blocking: enhance with IndexedDB data after render
      enhanceWithLocalData(data)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load"

      if (retryCountRef.current < maxRetries && !isBackground) {
        const delay = Math.min(1000 * Math.pow(2, retryCountRef.current), 8000)
        retryCountRef.current++
        setTimeout(() => loadQueue(false), delay)
        return
      }

      setError(message)
      setHydration('error')
      setIsRefreshing(false)
    }
  }, [])

  async function enhanceWithLocalData(serverData: QueueApiResponse) {
    try {
      const tenantId = getCookie('bz_tenant')
      const [localInvoices, allUnpaid] = await Promise.all([
        db().invoices.where('syncStatus').equals('pending').toArray().catch(() => [] as Invoice[]),
        db().invoices.where('status').anyOf('unpaid', 'overdue', 'partial').toArray().catch(() => [] as Invoice[]),
      ])

      const now = new Date()
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      let localToday = 0
      let localMonth = 0
      let localOutstanding = 0
      let localCaseCount = 0

      for (const inv of localInvoices) {
        const amt = inv.total || 0
        const created = new Date(inv.createdAt)
        localMonth += amt
        if (created >= todayStart) localToday += amt
      }
      for (const inv of allUnpaid) {
        const outstanding = (inv.total || 0) - (inv.paidAmount || 0)
        if (outstanding > 0) {
          localOutstanding += outstanding
          localCaseCount++
        }
      }

      const s = serverData.summary
      if (localOutstanding > 0 || localToday > 0 || localMonth > 0) {
        setSummary(prev => prev ? {
          ...prev,
          todaySales: (s?.todaySales || 0) + localToday,
          monthSales: (s?.monthSales || 0) + localMonth,
          collectibleToday: (s?.collectibleToday || 0) + localOutstanding,
          activeCases: (s?.activeCases || 0) + localCaseCount,
        } : null)
      }

    } catch {
      // Local data enhancement is best-effort
    }
  }

  useEffect(() => {
    const sName = getCookie("bz_tenant_name")
    if (sName) setShopName(decodeURIComponent(sName))

    try {
      const token = getCookie("bz_access")
      if (token) {
        const payload = JSON.parse(atob(token.split('.')[1]))
        if (payload.name) setUserName(payload.name)
        else if (payload.email) setUserName(payload.email.split('@')[0])
      }
    } catch (e) {}

    loadQueue(false)
    const onChanged = () => loadQueue(true)
    window.addEventListener("billzo:changed", onChanged)
    return () => window.removeEventListener("billzo:changed", onChanged)
  }, [loadQueue])

  const handleAction = async (caseId: string, action: string) => {
    setActionLoading(`${caseId}:${action}`)
    try {
      const res = await fetch("/api/recovery/queue/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ caseId, action }),
      })
      if (!res.ok) throw new Error("Action failed")
      await loadQueue(true)
    } catch (err) {
      console.error("Action failed:", err)
    } finally {
      setActionLoading(null)
    }
  }

  const isNewMerchant = summary && summary.totalCustomers === 0 && summary.todaySales === 0 && summary.monthSales === 0

  // ── Render states ──

  if (hydration === 'error') {
    return (
      <div className="px-4 py-20 max-w-lg mx-auto text-center">
        <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
        <p className="text-lg font-semibold text-foreground mb-2">Something went wrong</p>
        <p className="text-sm text-muted-foreground mb-6">{error}</p>
        <button
          onClick={() => { retryCountRef.current = 0; loadQueue(false) }}
          className="inline-flex items-center gap-2 px-8 py-3 bg-primary text-primary-foreground rounded-lg font-medium shadow-sm dark:shadow-[0_1px_3px_rgba(0,0,0,0.25)] hover:opacity-90 transition-opacity"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      </div>
    )
  }

  if (hydration === 'loading' || !summary) {
    return <DashboardSkeleton />
  }

  const priorityCases = summary.priorityCases || []
  const topCases = priorityCases.slice(0, 5)

  const totalInQueue = summary.totalActions || summary.activeCases || 0
  const completedInQueue = summary.completedActions || 0
  const pendingInQueue = summary.pendingActions || Math.max(0, totalInQueue - completedInQueue)
  const queuePct = totalInQueue > 0 ? Math.round((completedInQueue / totalInQueue) * 100) : 0

  const ps = summary.promiseSummary || { dueToday: 0, overdue: 0, upcoming: 0 }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6 pb-40 lg:pb-12">

      {/* ─── HEADER ──────────────────────────────── */}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground tracking-tight">
            {greeting()}{userName ? `, ${userName}` : ''}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {shopName ? `${shopName} • ` : ''}{formatDate()}
          </p>
        </div>
        {isRefreshing && (
          <span className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground">
            <RefreshCw className="w-3 h-3 animate-spin" />
            Syncing
          </span>
        )}
      </header>

      {/* ─── TODAY'S SUMMARY ─────────────────────────── */}
      <div className="bg-card border border-border rounded-xl p-4">
        <p className="text-sm text-foreground">
          You have <span className="font-semibold">{formatINR(summary.stuckMoneyTotal + summary.collectibleToday)}</span> outstanding.
          {summary.customersNeedingAction > 0
            ? ` ${summary.customersNeedingAction} customer${summary.customersNeedingAction > 1 ? 's' : ''} need attention today.`
            : ' No pending follow-ups.'}
          {summary.totalCollectedToday > 0 && ` Collected ${formatINR(summary.totalCollectedToday)} so far today.`}
        </p>
      </div>

      {isNewMerchant && (
        <div className="bg-primary rounded-xl p-6 text-primary-foreground shadow-sm dark:shadow-[0_1px_3px_rgba(0,0,0,0.25)]">
          <h3 className="font-semibold text-lg mb-1">Welcome to BillZo!</h3>
          <p className="text-primary-foreground/80 text-sm mb-4">Start by adding your first product or customer.</p>
          <div className="flex gap-2">
            <Link href="/products/add" className="bg-card text-primary px-4 py-2 rounded-lg text-xs font-semibold">Add Product</Link>
            <Link href="/parties/add" className="bg-primary-foreground/20 text-white px-4 py-2 rounded-lg text-xs font-semibold">Add Customer</Link>
          </div>
        </div>
      )}

      {/* ─── SECTION 1: Outstanding (north-star metric) ─── */}
      <div className="bg-foreground text-background rounded-2xl p-5 lg:p-6 shadow-lg dark:shadow-[0_4px_16px_rgba(0,0,0,0.35)]">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider opacity-70">Outstanding</span>
          {summary.customersNeedingAction > 0 && (
            <span className="bg-rose-500/20 text-rose-300 text-xs font-medium px-2 py-0.5 rounded-full">
              {summary.customersNeedingAction} need action
            </span>
          )}
        </div>
        <p className="text-4xl font-bold tabular-nums tracking-tight">
          {formatINR(summary.stuckMoneyTotal + summary.collectibleToday)}
        </p>
        <div className="border-t border-white/10 mt-3 pt-3 grid grid-cols-2 gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider opacity-60">Collected Today</p>
            <p className="text-lg font-bold mt-0.5">{formatINR(summary.totalCollectedToday)}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider opacity-60">Pending</p>
            <p className="text-lg font-bold mt-0.5">
              {formatINR(Math.max(0, (summary.stuckMoneyTotal + summary.collectibleToday) - summary.totalCollectedToday))}
            </p>
          </div>
        </div>
        <div className="border-t border-white/10 mt-3 pt-3 grid grid-cols-2 gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider opacity-60">Overdue</p>
            <p className="text-lg font-bold mt-0.5">{formatINR(summary.stuckMoneyTotal)}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider opacity-60">Not Due</p>
            <p className="text-lg font-bold mt-0.5">{formatINR(summary.dueToday)}</p>
          </div>
        </div>
      </div>

      {/* ─── SECTION 2: Today's Priority ─────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Today's Priority
          </h2>
          {topCases.length > 0 && (
            <Link href="/recovery/queue" className="text-xs font-medium text-primary hover:text-primary/80 transition-colors">
              View all
            </Link>
          )}
        </div>
        {topCases.length > 0 ? (
          <div className="space-y-3">
            {topCases.map((pc: any) => {
              const isSending = actionLoading === `${pc.caseId}:send_reminder`
              const reasons: { text: string; urgent: boolean }[] = []
              if (pc.oldestOverdueDays > 0) reasons.push({ text: `${pc.oldestOverdueDays} days overdue`, urgent: pc.oldestOverdueDays > 30 })
              if (pc.brokenPromises > 0) reasons.push({ text: `${pc.brokenPromises} broken promise${pc.brokenPromises > 1 ? 's' : ''}`, urgent: true })
              if (pc.ignoredReminders > 0) reasons.push({ text: `${pc.ignoredReminders} unread reminder${pc.ignoredReminders > 1 ? 's' : ''}`, urgent: pc.ignoredReminders > 2 })
              if (reasons.length === 0) reasons.push({ text: 'Needs follow-up', urgent: false })
              return (
                <div key={pc.caseId} className="bg-card border border-border rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <Link href={`/parties/${pc.customerId}`} className="font-semibold text-foreground hover:text-primary transition-colors min-w-0 truncate">
                      {pc.customerName}
                    </Link>
                    <span className="text-lg font-bold text-foreground tabular-nums shrink-0">
                      {formatINR(pc.totalOverdue)}
                    </span>
                  </div>
                  <div className="mt-2 space-y-0.5">
                    {reasons.map((r, i) => (
                      <p key={i} className={`text-xs flex items-center gap-1.5 ${r.urgent ? 'text-destructive' : 'text-muted-foreground'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${r.urgent ? 'bg-destructive' : 'bg-muted-foreground/40'}`} />
                        {r.text}
                      </p>
                    ))}
                  </div>
                  <div className="mt-3 pt-3 border-t border-border">
                    <button
                      onClick={() => handleAction(pc.caseId, 'send_reminder')}
                      disabled={isSending}
                      className="w-full inline-flex items-center justify-center gap-1.5 h-9 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition-all active:scale-[0.97]"
                    >
                      {isSending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                      Send Reminder
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="bg-card border border-border rounded-xl p-6 text-center">
            <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
            <p className="font-semibold text-foreground">All caught up</p>
            <p className="text-xs text-muted-foreground mt-0.5">No customers need follow-up right now.</p>
          </div>
        )}
      </section>

      {/* ─── SECTION 3: Today's Queue ─────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Today's Queue</h2>
          <Link href="/recovery/queue" className="text-xs font-medium text-primary hover:text-primary/80 transition-colors">
            View Queue
          </Link>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-foreground">
              {completedInQueue} / {totalInQueue} completed
            </span>
            {pendingInQueue > 0 && (
              <span className="text-xs font-medium text-muted-foreground">{pendingInQueue} remaining</span>
            )}
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${queuePct}%` }}
            />
          </div>
        </div>
      </section>

      {/* ─── SECTION 4: Quick Actions ─────────────── */}
      <section>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { label: "New Bill", icon: Plus, href: "/pos", cls: "bg-foreground text-background shadow-sm dark:shadow-[0_1px_3px_rgba(0,0,0,0.25)]" },
            { label: "Receive Payment", icon: IndianRupee, href: "/pulse", cls: "bg-card text-foreground border border-border hover:border-primary/30" },
            { label: "Add Party", icon: UserPlus, href: "/parties/add", cls: "bg-card text-foreground border border-border hover:border-primary/30" },
            { label: "View Queue", icon: Send, href: "/recovery/queue", cls: "bg-card text-foreground border border-border hover:border-primary/30" },
          ].map((action, i) => (
            <Link
              key={i}
              href={action.href}
              className={`flex items-center justify-center gap-2.5 px-4 py-3.5 rounded-lg text-xs font-medium transition-all active:scale-[0.98] ${action.cls}`}
            >
              <action.icon size={16} strokeWidth={2.5} />
              {action.label}
            </Link>
          ))}
        </div>
      </section>

      {/* ─── SECTION 5: Promises ─────────────── */}
      {(ps.dueToday > 0 || ps.overdue > 0 || ps.upcoming > 0) && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Promises</h2>
            <Link href="/recovery/queue" className="text-xs font-medium text-primary hover:text-primary/80 transition-colors">
              Review
            </Link>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Due Today", count: ps.dueToday, cls: "text-warning-foreground bg-warning-soft border-warning/20" },
              { label: "Broken", count: ps.overdue, cls: "text-destructive bg-destructive/10 border-destructive/20" },
              { label: "Upcoming", count: ps.upcoming, cls: "text-primary bg-primary/5 border-primary/10" },
            ].map(p => (
              <div key={p.label} className={`rounded-xl border p-4 text-center ${p.cls}`}>
                <p className="text-2xl font-bold tabular-nums">{p.count}</p>
                <p className="text-[10px] font-semibold uppercase tracking-wider mt-1">{p.label}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ─── SECTION 6: Latest Activity ─────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Latest Activity</h2>
          {recentEvents.length > 0 && (
            <Link href="/recovery/history" className="text-xs font-medium text-primary hover:text-primary/80 transition-colors">
              View All →
            </Link>
          )}
        </div>
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm dark:shadow-[0_1px_3px_rgba(0,0,0,0.25)] relative">
          {recentEvents.length > 0 ? (
            <div className="space-y-5 relative">
              <div className="absolute left-[11px] top-2 bottom-2 w-px bg-border" />
              {recentEvents.slice(0, 5).map((evt, i) => {
                const theme = getEventIcon(evt)
                return (
                  <div key={i} className="flex items-start gap-4 relative z-10">
                    <div className={`w-6 h-6 rounded-full ${theme.bg} ${theme.color} flex items-center justify-center ring-4 ring-card`}>
                      <theme.icon size={12} strokeWidth={2.5} />
                    </div>
                    <div className="flex-1 min-w-0 pt-0.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-foreground font-medium truncate">{evt.reason}</p>
                        <span className="text-[10px] font-medium text-muted-foreground shrink-0">
                          {formatTime(evt.occurredAt)}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="py-4 text-center text-sm text-muted-foreground">No recent activity.</div>
          )}
        </div>
      </section>

    </div>
  )
}