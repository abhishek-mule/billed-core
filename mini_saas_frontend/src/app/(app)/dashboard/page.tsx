"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import Link from "next/link"
import {
  Send, IndianRupee, CheckCircle2, Loader2,
  AlertCircle, BarChart3, Plus,
  TrendingUp, UserPlus, FileText, Package,
  MessageSquare, Activity, Bell, RefreshCw,
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
  return { icon: Activity, color: 'text-slate-500', bg: 'bg-muted' }
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
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-8 pb-40 lg:pb-12">
      {/* Header skeleton */}
      <div className="space-y-4">
        <div className="h-7 w-48 bg-muted rounded animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-28 bg-muted rounded-xl animate-pulse" />
          ))}
        </div>
      </div>

      {/* Hero card skeleton */}
      <div className="h-32 bg-muted rounded-xl animate-pulse" />

      {/* Priority card skeleton */}
      <div className="space-y-4">
        <div className="h-4 w-32 bg-muted rounded animate-pulse" />
        <div className="h-48 bg-muted rounded-xl animate-pulse" />
        <div className="h-24 bg-muted rounded-xl animate-pulse" />
      </div>

      {/* Quick actions skeleton */}
      <div className="grid grid-cols-4 gap-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-12 bg-muted rounded-lg animate-pulse" />
        ))}
      </div>

      {/* Bottom sections skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-[0.8fr_1.2fr] gap-6">
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="h-64 bg-muted rounded-xl animate-pulse" />
      </div>
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
  const [completedCase, setCompletedCase] = useState<string | null>(null)
  const [shopName, setShopName] = useState("")
  const [userName, setUserName] = useState("")
  const [upcoming, setUpcoming] = useState<{ customerName: string; amount: number; stage: string; nextRecoveryAt: string | null; isPending: boolean }[]>([])

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

      if (localOutstanding > 0 || localToday > 0 || localMonth > 0) {
        setSummary(prev => prev ? {
          ...prev,
          todaySales: serverData.summary.todaySales + localToday,
          monthSales: serverData.summary.monthSales + localMonth,
          collectibleToday: (serverData.summary.collectibleToday || 0) + localOutstanding,
          activeCases: (serverData.summary.activeCases || 0) + localCaseCount,
        } : null)
      }

      // Compute upcoming reminders from IndexedDB
      const upcomingList = allUnpaid
        .filter(inv => {
          const outstanding = (inv.total || 0) - (inv.paidAmount || 0)
          return outstanding > 0
        })
        .map(inv => {
          const outstanding = (inv.total || 0) - (inv.paidAmount || 0)
          return {
            customerName: inv.customerName,
            amount: outstanding,
            stage: inv.recoveryStage || 't0_soft',
            nextRecoveryAt: inv.nextRecoveryAt || null,
            isPending: !inv.nextRecoveryAt,
          }
        })
        .sort((a, b) => {
          if (a.isPending && !b.isPending) return -1
          if (!a.isPending && b.isPending) return 1
          if (a.nextRecoveryAt && b.nextRecoveryAt) return a.nextRecoveryAt.localeCompare(b.nextRecoveryAt)
          return 0
        })
        .slice(0, 5)
      setUpcoming(upcomingList)
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
      setCompletedCase(caseId)
      setTimeout(() => setCompletedCase(null), 2000)
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
          className="inline-flex items-center gap-2 px-8 py-3 bg-primary text-primary-foreground rounded-lg font-medium shadow-sm hover:opacity-90 transition-opacity"
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

  const collectionRate = summary.collectibleToday > 0
    ? Math.min(100, Math.round((summary.totalCollectedToday / (summary.totalCollectedToday + summary.collectibleToday)) * 100))
    : 100

  const attentionItems = items.filter(i => i.overdue > 30 || i.promiseStatus === "broken" || i.engagementState === "ghosting").length

  const priorityCases = summary.priorityCases || []
  const topCases = priorityCases.slice(0, 5)

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

      {isNewMerchant && (
        <div className="bg-primary rounded-xl p-6 text-primary-foreground shadow-sm">
          <h3 className="font-semibold text-lg mb-1">Welcome to BillZo!</h3>
          <p className="text-primary-foreground/80 text-sm mb-4">Start by adding your first product or customer.</p>
          <div className="flex gap-2">
            <Link href="/products/add" className="bg-card text-primary px-4 py-2 rounded-lg text-xs font-semibold">Add Product</Link>
            <Link href="/parties/add" className="bg-primary-foreground/20 text-white px-4 py-2 rounded-lg text-xs font-semibold">Add Customer</Link>
          </div>
        </div>
      )}

      {/* ─── SECTION 1: Recoverable Today ─────────── */}
      <div className="bg-slate-900 text-white rounded-2xl p-5 lg:p-6 shadow-lg">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider opacity-70">
            Recoverable Today
          </span>
          {summary.customersNeedingAction > 0 && (
            <span className="bg-rose-500/20 text-rose-300 text-xs font-medium px-2 py-0.5 rounded-full">
              {summary.customersNeedingAction} customer{summary.customersNeedingAction > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <p className="text-4xl font-bold tabular-nums tracking-tight">
          {formatINR(summary.stuckMoneyTotal)}
        </p>
        <p className="text-sm text-white/60 mt-1">
          {summary.collectedAfterFollowup > 0
            ? `₹${summary.collectedAfterFollowup.toLocaleString('en-IN')} recovered this month`
            : 'Track and recover outstanding payments'}
        </p>
      </div>

      {/* ─── SECTION 2: Top Customers ─────────────── */}
      {topCases.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Top Customers To Chase
            </h2>
          </div>
          {topCases.map((pc: any) => {
            const isSending = actionLoading === `${pc.caseId}:send_reminder`
            const signal = pc.brokenPromises > 0 ? 'Promise broken'
              : pc.oldestOverdueDays > 30 ? `${pc.oldestOverdueDays} days overdue`
              : pc.oldestOverdueDays > 0 ? `${pc.oldestOverdueDays} days overdue`
              : 'Due today'
            const signalCls = pc.brokenPromises > 0 || pc.oldestOverdueDays > 30
              ? 'text-destructive' : 'text-warning-foreground'
            return (
              <div key={pc.caseId} className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Link href={`/parties/${pc.customerId}`} className="font-semibold text-foreground hover:text-primary transition-colors truncate">
                        {pc.customerName}
                      </Link>
                    </div>
                    <div className="flex items-baseline gap-3 mt-1">
                      <span className="text-xl font-bold text-foreground tabular-nums">
                        {formatINR(pc.totalOverdue)}
                      </span>
                      {pc.openInvoiceCount > 1 && (
                        <span className="text-xs text-muted-foreground">{pc.openInvoiceCount} invoices</span>
                      )}
                    </div>
                    <p className={`text-xs font-medium mt-0.5 ${signalCls}`}>{signal}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
                  <button
                    onClick={() => handleAction(pc.caseId, 'send_reminder')}
                    disabled={isSending}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition-all active:scale-[0.97]"
                  >
                    {isSending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                    Send
                  </button>
                  <Link
                    href={`/parties/${pc.customerId}`}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-lg border border-border text-xs font-semibold text-foreground hover:bg-muted transition-colors"
                  >
                    View
                  </Link>
                </div>
              </div>
            )
          })}

          <Link
            href="/recovery/queue"
            className="flex items-center justify-center gap-2 w-full py-3 rounded-xl border-2 border-dashed border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors"
          >
            Open Recovery Queue
            <TrendingUp size={16} />
          </Link>
        </section>
      )}

      {topCases.length === 0 && (
        <section className="space-y-3">
          <div className="bg-card border border-border rounded-xl p-8 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
            <p className="font-semibold text-foreground text-lg">All caught up</p>
            <p className="text-sm text-muted-foreground mt-1">No customers need follow-up right now.</p>
            <Link
              href="/pos"
              className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 transition-colors"
            >
              + New Invoice
            </Link>
          </div>
          <Link
            href="/recovery/queue"
            className="block text-center text-xs font-medium text-primary hover:text-primary/80 transition-colors"
          >
            View Recovery Queue
          </Link>
        </section>
      )}

      {/* ─── SECTION 3: Quick Actions ─────────────── */}
      <section>
        <div className="bg-card/90 backdrop-blur-xl border border-border rounded-xl p-2 shadow-lg lg:shadow-none lg:bg-transparent lg:border-none lg:p-0">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: "New Bill", icon: Plus, href: "/pos", cls: "bg-foreground text-background shadow-sm" },
              { label: "Record Payment", icon: IndianRupee, href: "/pulse", cls: "bg-card text-foreground border border-border hover:border-primary/30" },
              { label: "Add Customer", icon: UserPlus, href: "/parties/add", cls: "bg-card text-foreground border border-border hover:border-primary/30" },
              { label: "Send Reminder", icon: Send, href: "/recovery/queue", cls: "bg-card text-foreground border border-border hover:border-primary/30" },
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
        </div>
      </section>

      {/* ─── BELOW FOLD ───────────────────────────── */}
      <details className="group">
        <summary className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors py-2">
          <span className="group-open:rotate-90 transition-transform text-[10px]">▶</span>
          More Details
        </summary>

        <div className="mt-4 space-y-6">
          {/* Upcoming Reminders */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Upcoming Reminders</h2>
              <Link href="/recovery/history" className="text-xs font-medium text-primary hover:text-primary/80 transition-colors">
                View all
              </Link>
            </div>
            {upcoming.length > 0 ? (
              <div className="bg-card border border-border rounded-xl divide-y divide-border overflow-hidden shadow-sm">
                {upcoming.map((r, i) => {
                  const diff = r.nextRecoveryAt ? new Date(r.nextRecoveryAt).getTime() - Date.now() : -1
                  const inDays = Math.ceil(diff / 86400000)
                  const inHours = Math.ceil(diff / 3600000)
                  const when = r.isPending ? "Now"
                    : diff < 0 ? "Overdue"
                    : inDays <= 0 ? `${inHours}h`
                    : inDays === 1 ? "Tomorrow"
                    : `in ${inDays}d`
                  const isUrgent = r.isPending || diff < 86400000
                  return (
                    <div key={i} className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                          r.isPending ? 'bg-warning-soft text-warning-foreground' : 'bg-primary/5 text-primary'
                        }`}>
                          <Bell size={14} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{r.customerName}</p>
                          <p className="text-xs text-muted-foreground tabular-nums">{formatINR(r.amount)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          r.isPending ? 'bg-destructive/15 text-destructive animate-pulse' : isUrgent ? 'bg-warning-soft text-warning-foreground' : 'bg-muted text-muted-foreground'
                        }`}>
                          {when}
                        </span>
                        <span className="text-[10px] font-medium text-muted-foreground capitalize">
                          {r.stage?.replace('_', ' ') || 'reminder'}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="bg-card border border-dashed border-border rounded-xl p-6 text-center">
                <Bell className="w-6 h-6 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-xs font-medium text-muted-foreground">No upcoming reminders scheduled</p>
              </div>
            )}
          </section>

          {/* Health & Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-[0.8fr_1.2fr] gap-6">
            <section className="space-y-4">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Health</h2>
              <div className="grid grid-cols-1 gap-3">
                {[
                  { label: "Sales Today", value: formatINR(summary.todaySales), detail: summary.todaySales > 0 ? `${((summary.totalCollectedToday / summary.todaySales) * 100).toFixed(0)}% collected` : "No sales yet", color: "text-primary", bg: "bg-primary/5", icon: TrendingUp },
                  { label: "Inventory", value: summary.lowStockItems > 0 ? `${summary.lowStockItems} Low` : "Stock OK", detail: summary.lowStockItems > 0 ? "Reorder soon" : "Normal", color: summary.lowStockItems > 0 ? "text-warning-foreground" : "text-success", bg: summary.lowStockItems > 0 ? "bg-warning-soft" : "bg-success-soft", icon: Package },
                  { label: "Recovery Rate", value: `${collectionRate}%`, detail: `${summary.recoveredThisMonth > 0 ? `${formatINR(summary.recoveredThisMonth)} this month` : "No data yet"}`, color: "text-success", bg: "bg-success-soft", icon: BarChart3 },
                ].map((card, i) => (
                  <div key={i} className={`rounded-lg p-4 flex items-center justify-between border border-border/50 transition-all ${card.bg}`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg bg-card flex items-center justify-center ${card.color} shadow-sm`}>
                        <card.icon size={20} strokeWidth={1.5} />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{card.label}</p>
                        <p className={`text-base font-semibold tracking-tight ${card.color}`}>{card.value}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-medium text-muted-foreground">{card.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Activity</h2>
              <div className="bg-card border border-border rounded-xl p-5 shadow-sm relative">
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
        </div>
      </details>

    </div>
  )
}
