'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState, useMemo } from 'react'
import { AlertTriangle, Bell, CheckCircle2, IndianRupee, PackageMinus, RefreshCcw, RotateCcw, Send, TrendingUp, Wallet, Zap } from 'lucide-react'
import { markPaid, repeatLastInvoice, sendReminder } from '@/lib/billzo/actions'
import { useBillzo } from './useBillzo'
import { Loader } from './Loader'
import { getRecoveryMetrics, RecoveryStats } from '@/lib/billzo/recovery-stats'
import { getTenantId } from '@/lib/billzo/tenant'

const money = (value: number) => `₹${value.toLocaleString('en-IN')}`

interface PaywallState {
  show: boolean
  type?: 'invoice' | 'reminder'
  recoveredAmount?: number
}

interface DashboardStats {
  totalRecovered: number
  pendingAmount: number
  invoiceCount: number
  reminderCount: number
  overdueCount: number
  lowStockCount: number
  collectedToday: number
}

type BriefAction = {
  title: string
  detail: string
  priority: 'high' | 'medium' | 'low'
  actionLabel: string
  actionPath: string
}

type DailyBrief = {
  headline: string
  source: 'gemini' | 'fallback'
  actions: BriefAction[]
}

export function Dashboard() {
  const router = useRouter()
  const { state, loading, error } = useBillzo()
  const [paywall, setPaywall] = useState<PaywallState>({ show: false })
  const [brief, setBrief] = useState<DailyBrief | null>(null)
  const [briefLoading, setBriefLoading] = useState(false)
  const [recoveryStats, setRecoveryStats] = useState<RecoveryStats | null>(null)
  
  useEffect(() => {
    const tenantId = getTenantId()
    if (tenantId) {
      getRecoveryMetrics(tenantId).then(setRecoveryStats)
    }
  }, [state])

  const brokenPromises = recoveryStats?.brokenPromises || []

  const stats = useMemo<DashboardStats>(() => {
    if (!state) {
      return {
        totalRecovered: 0,
        pendingAmount: 0,
        invoiceCount: 0,
        reminderCount: 0,
        overdueCount: 0,
        lowStockCount: 0,
        collectedToday: 0,
      }
    }

    const payments = state.payments || []
    const invoices = state.invoices || []

    const totalRecovered = payments
      .filter((p) => p.status === 'success')
      .reduce((sum, p) => sum + p.amount, 0)

    const pendingAmount = invoices
      .filter((i) => i.status !== 'paid')
      .reduce((sum, i) => sum + i.total - i.paidAmount, 0)

    const today = new Date().toISOString().slice(0, 10)
    const collectedToday = payments
      .filter((p) => p.status === 'success' && p.createdAt.startsWith(today))
      .reduce((sum, p) => sum + p.amount, 0)

    const now = new Date()
    const overdueCount = invoices.filter((i) => i.status !== 'paid' && new Date(i.dueAt) < now).length

    return {
      totalRecovered,
      pendingAmount,
      invoiceCount: invoices.length,
      reminderCount: state.tenant?.reminderCount || 0,
      overdueCount,
      lowStockCount: state.snapshot.lowStockCount,
      collectedToday,
    }
  }, [state])

  useEffect(() => {
    if (!state) return

    if (state.snapshot.failedQueueCount > 0) {
      console.warn(`${state.snapshot.failedQueueCount} items failed to sync`)
    }
  }, [state])

  const buildBriefSummary = () => {
    if (!state) return null

    const unpaid = state.invoices
      .filter((invoice) => invoice.status !== 'paid')
      .map((invoice) => ({
        id: invoice.id,
        customerName: invoice.customerName,
        amount: invoice.total - invoice.paidAmount,
        dueAt: invoice.dueAt,
        daysOverdue: Math.max(0, Math.floor((Date.now() - new Date(invoice.dueAt).getTime()) / (1000 * 60 * 60 * 24))),
        status: invoice.status,
      }))
      .sort((a, b) => b.daysOverdue - a.daysOverdue)

    const lowStock = state.products
      .filter((product) => product.stock <= product.lowStockAt)
      .map((product) => ({
        name: product.name,
        stock: product.stock,
        lowStockAt: product.lowStockAt,
      }))
      .slice(0, 5)

    return {
      businessName: state.session.businessName,
      plan: state.tenant?.plan || 'starter',
      pendingAmount: stats.pendingAmount,
      overdueCount: stats.overdueCount,
      lowStockCount: stats.lowStockCount,
      collectedToday: stats.collectedToday,
      invoiceCount: stats.invoiceCount,
      reminderCount: stats.reminderCount,
      topUnpaid: unpaid.slice(0, 5),
      lowStock,
      generatedAt: new Date().toISOString(),
    }
  }

  const showBriefNotification = async (nextBrief: DailyBrief) => {
    if (typeof window === 'undefined' || !('Notification' in window)) return

    const permission = Notification.permission === 'granted'
      ? 'granted'
      : await Notification.requestPermission()

    if (permission !== 'granted') return

    new Notification('BillZo smart brief', {
      body: nextBrief.headline,
      icon: '/logo_new.png',
      tag: 'billzo-daily-brief',
    })
  }

  const loadDailyBrief = async (force = false) => {
    if (!state || briefLoading) return

    const today = new Date().toISOString().slice(0, 10)
    const cacheKey = `billzo_daily_brief_${state.tenant?.id || state.session.tenantId || 'default'}_${today}`

    if (!force) {
      try {
        const cached = localStorage.getItem(cacheKey)
        if (cached) {
          setBrief(JSON.parse(cached))
          return
        }
      } catch {}
    }

    const summary = buildBriefSummary()
    if (!summary) return

    setBriefLoading(true)
    try {
      const response = await fetch('/api/ai/daily-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(summary),
      })

      if (!response.ok) throw new Error('Failed to generate brief')

      const nextBrief = await response.json()
      setBrief(nextBrief)
      localStorage.setItem(cacheKey, JSON.stringify(nextBrief))
      await showBriefNotification(nextBrief)
    } catch (error) {
      console.error('Daily brief error:', error)
    } finally {
      setBriefLoading(false)
    }
  }

  useEffect(() => {
    if (!state) return
    loadDailyBrief(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.tenant?.id, stats.pendingAmount, stats.lowStockCount, stats.overdueCount])

  if (loading) return <LoadingState />
  if (error) return <ErrorState error={error} onRetry={() => router.refresh()} />
  if (!state) return <NoSessionState onLogin={() => router.push('/auth')} />

  const unpaid = state.invoices.filter((invoice) => invoice.status !== 'paid')
  const lowStock = state.products.filter((product) => product.stock <= product.lowStockAt)
  const primaryUnpaid = unpaid[0]
  const isFreePlan = state.tenant?.plan === 'starter'

  const handleAction = async (action: () => Promise<{ success: boolean; blocked?: string; blockType?: string; error?: string }>) => {
    const result = await action()
    if (!result.success) {
      if (result.blocked === 'paywall') {
        setPaywall({ show: true, type: (result.blockType as 'invoice' | 'reminder') || 'invoice', recoveredAmount: stats.totalRecovered })
      }
    }
  }

  return (
    <div className="space-y-8">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/80">Shop Active</p>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{state.session.businessName}</h1>
        </div>
        <span className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${
          state.tenant?.plan === 'pro' || state.tenant?.plan === 'growth'
            ? 'bg-success-soft text-success border border-success/20'
            : 'bg-warning-soft text-warning border border-warning/20'
        }`}>
          {state.tenant?.plan || 'starter'} plan
        </span>
      </header>

      <section className="rounded-2xl border bg-white p-6 shadow-sm ring-1 ring-border/50">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Zap className="h-3 w-3 fill-current" />
              </span>
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/80">AI Daily Brief</p>
            </div>
            <h2 className="mt-2 text-xl font-semibold tracking-tight">
              {brief?.headline || 'Preparing today\'s business priorities...'}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {brief?.source === 'gemini' ? 'Insights powered by Gemini AI' : 'Smart fallback brief'}
            </p>
          </div>
          <button
            onClick={() => loadDailyBrief(true)}
            disabled={briefLoading}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border bg-white text-muted-foreground transition-all hover:bg-muted hover:text-foreground disabled:opacity-50"
            title="Refresh smart brief"
          >
            <RefreshCcw className={`h-4 w-4 ${briefLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {(brief?.actions || []).map((action) => (
            <button
              key={`${action.title}-${action.actionPath}`}
              onClick={() => router.push(action.actionPath)}
              className={`group relative rounded-xl border p-4 text-left transition-all hover:shadow-md ${
                action.priority === 'high'
                  ? 'border-destructive/20 bg-destructive/[0.02] hover:bg-destructive/[0.04]'
                  : action.priority === 'medium'
                    ? 'border-warning/20 bg-warning/[0.02] hover:bg-warning/[0.04]'
                    : 'border-border bg-white hover:border-primary/20 hover:bg-muted/30'
              }`}
            >
              <span className={`text-[10px] font-bold uppercase tracking-widest ${
                action.priority === 'high' ? 'text-destructive' : action.priority === 'medium' ? 'text-warning-foreground' : 'text-muted-foreground'
              }`}>
                {action.priority} priority
              </span>
              <h3 className="mt-1.5 font-semibold text-foreground">{action.title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{action.detail}</p>
              <div className="mt-4 flex items-center gap-1.5 text-xs font-bold text-primary transition-all group-hover:gap-2">
                {action.actionLabel}
                <Send className="h-3 w-3" />
              </div>
            </button>
          ))}

          {!brief && (
            <div className="flex min-h-[120px] items-center justify-center rounded-xl border border-dashed p-4 text-sm text-muted-foreground md:col-span-3">
              {briefLoading ? (
                <div className="flex items-center gap-3">
                  <Loader />
                  <span>Gemini is analyzing sales, credit, and stock signals...</span>
                </div>
              ) : 'Your daily brief will appear here once data is processed.'}
            </div>
          )}
        </div>
      </section>

      {recoveryStats && (
        <section className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-primary/20 bg-primary/[0.02] p-6 shadow-sm ring-1 ring-primary/5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-primary">Money Recovered</p>
            <p className="mt-2 text-3xl font-bold tracking-tight text-foreground">{money(recoveryStats.recoveredAmount)}</p>
            <div className="mt-2 flex items-center gap-1 text-[10px] font-medium text-primary">
              <TrendingUp className="h-3 w-3" />
              <span>+12% from last month</span>
            </div>
          </div>
          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/80">Cases Recovered</p>
            <p className="mt-2 text-3xl font-bold tracking-tight">{recoveryStats.recoveredCasesCount}</p>
          </div>
          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/80">Recovery Rate</p>
            <p className="mt-2 text-3xl font-bold tracking-tight">{Math.round(recoveryStats.recoveryRate)}%</p>
          </div>
        </section>
      )}

      {/* Broken Promises */}
      {brokenPromises.length > 0 && (
        <section className="rounded-2xl border border-rose-200 bg-rose-50/50 p-5 shadow-sm">
          <div className="flex items-center gap-2 text-rose-700 mb-3">
            <AlertTriangle className="h-5 w-5" />
            <p className="text-xs font-bold uppercase tracking-wider">
              {brokenPromises.length} Broken Promise{brokenPromises.length > 1 ? 's' : ''}
            </p>
          </div>
          <div className="space-y-2">
            {brokenPromises.map((bp) => (
              <div key={bp.customerId} className="flex items-center justify-between rounded-xl bg-white border border-rose-200 px-4 py-3">
                <div>
                  <p className="font-semibold text-slate-900">{bp.customerName}</p>
                  <p className="text-xs text-rose-600">
                    Promised by {new Date(bp.promiseDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    {new Date(bp.promiseDate) < new Date() && (
                      <> — overdue by {Math.floor((Date.now() - new Date(bp.promiseDate).getTime()) / 86400000)}d</>
                    )}
                  </p>
                </div>
                <span className="text-sm font-bold text-slate-900 tabular-nums">₹{bp.amount.toLocaleString('en-IN')}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="grid gap-4 sm:grid-cols-4">
        <button onClick={() => handleAction(() => repeatLastInvoice())} className="action-tile">
          <RotateCcw className="h-5 w-5 text-primary" />
          <span>Repeat Last</span>
        </button>
        <button
          onClick={() => primaryUnpaid && handleAction(() => sendReminder(primaryUnpaid))}
          className="action-tile"
          disabled={!primaryUnpaid}
        >
          <Send className="h-5 w-5 text-primary" />
          <span>Remind</span>
        </button>
      </section>

      <section className="space-y-4">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/80">Needs Attention</h2>
        <Attention
          icon={<IndianRupee className="h-5 w-5" />}
          text={`${money(stats.pendingAmount)} pending`}
          cta="Collect Now"
          onClick={() => primaryUnpaid && handleAction(() => sendReminder(primaryUnpaid))}
        />
        <Attention
          icon={<Bell className="h-5 w-5" />}
          text={`${stats.overdueCount} bills overdue`}
          cta="Send Reminder"
          onClick={() => primaryUnpaid && handleAction(() => sendReminder(primaryUnpaid))}
        />
        <Attention
          icon={<PackageMinus className="h-5 w-5" />}
          text={`${stats.lowStockCount} low stock`}
          cta="Restock"
          onClick={() => router.push('/purchases')}
        />
      </section>

      <section className="grid gap-4 sm:grid-cols-4">
        <Metric label="Collected today" value={money(stats.collectedToday)} />
        <Metric label="Total invoices" value={String(stats.invoiceCount)} />
        <Metric label="Reminders sent" value={String(stats.reminderCount)} />
        <Metric label="Read reminders" value={String(state.snapshot.readReminderCount)} />
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4">
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/80">Recovery Queue</h2>
          {unpaid.length === 0 ? (
            <div className="rounded-xl border border-dashed bg-white p-10 text-center shadow-sm">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-success/10 text-success">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <p className="font-semibold text-foreground">
                {stats.totalRecovered > 0 ? 'All caught up! 🎉' : 'No pending invoices'}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {stats.totalRecovered > 0 ? 'You\'ve recovered all outstanding payments.' : 'Send your first invoice to start recovering money.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {unpaid.slice(0, 4).map((invoice) => (
                <div key={invoice.id} className="row-card">
                  <div>
                    <p className="font-semibold text-foreground">{invoice.customerName}</p>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{money(invoice.total - invoice.paidAmount)}</span>
                      <span>•</span>
                      <span>{invoice.lastWhatsAppStatus || 'No status'}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="icon-button bg-primary text-primary-foreground border-primary hover:opacity-90"
                      onClick={() => handleAction(() => sendReminder(invoice))}
                      title="Send Reminder"
                    >
                      <Send className="h-4 w-4" />
                    </button>

                    <button
                      className="icon-button"
                      onClick={() => handleAction(() => markPaid(invoice))}
                      title="Mark Paid"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/80">Activity</h2>
          {state.activity.length === 0 ? (
            <div className="rounded-xl border border-dashed bg-white p-10 text-center shadow-sm">
              <p className="text-sm text-muted-foreground">No recent activity found.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {state.activity.slice(0, 6).map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-4 rounded-lg border border-transparent px-3 py-2 transition-all hover:bg-muted/50">
                  <div className="flex items-center gap-3">
                    <div className="h-2 w-2 rounded-full bg-primary/40" />
                    <div>
                      <p className="text-sm font-medium text-foreground">{item.label}</p>
                      <p className="text-[10px] font-medium text-muted-foreground">
                        {new Date(item.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                  {item.amount ? <span className="text-sm font-semibold text-foreground">{money(item.amount)}</span> : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {lowStock.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/80">Living Inventory</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {lowStock.map((product) => (
              <div key={product.id} className="row-card border-warning/20 bg-warning/[0.02]">
                <div>
                  <p className="font-semibold text-foreground">{product.name}</p>
                  <p className="text-xs font-medium text-warning-foreground">{product.stock} left - min {product.lowStockAt}</p>
                </div>
                <button className="primary-button" onClick={() => router.push('/purchases')}>
                  Restock
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {paywall.show && (
        <PaywallOverlay
          type={paywall.type || 'invoice'}
          recoveredAmount={paywall.recoveredAmount || 0}
          onClose={() => setPaywall({ show: false })}
          onUpgrade={() => router.push('/pricing')}
        />
      )}
    </div>
  )
}

function PaywallOverlay({
  type,
  recoveredAmount,
  onClose,
  onUpgrade,
}: {
  type: 'invoice' | 'reminder'
  recoveredAmount: number
  onClose: () => void
  onUpgrade: () => void
}) {
  const limitType = type === 'invoice' ? 'invoices' : 'reminders'
  const roiMultiple = recoveredAmount > 0 ? Math.floor(recoveredAmount / 299) : 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-2xl ring-1 ring-border">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
          <TrendingUp className="h-8 w-8" />
        </div>

        {recoveredAmount > 0 ? (
          <>
            <h2 className="text-xl font-bold text-foreground">You recovered {money(recoveredAmount)}!</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              That's {roiMultiple}x the cost of Pro. Unlock unlimited recovery and grow faster.
            </p>
          </>
        ) : (
          <>
            <h2 className="text-xl font-bold text-foreground">Unlock Unlimited {limitType}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              You've reached the free limit. Upgrade to Pro for unlimited access and auto-recovery.
            </p>
          </>
        )}

        <div className="mt-8 flex flex-col gap-3">
          <button
            onClick={onUpgrade}
            className="w-full rounded-xl bg-primary py-3.5 text-sm font-bold text-white shadow-lg shadow-primary/20 transition-all hover:opacity-90 active:scale-[0.98]"
          >
            Upgrade to Pro • ₹299/mo
          </button>
          <button onClick={onClose} className="w-full py-2 text-sm font-semibold text-muted-foreground hover:text-foreground">
            Maybe Later
          </button>
        </div>

        <p className="mt-6 text-[11px] font-medium text-muted-foreground/60">
          Cancel anytime • Priority support • Advanced analytics
        </p>
      </div>
    </div>
  )
}

function Attention({ icon, text, cta, onClick }: { icon: React.ReactNode; text: string; cta: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center justify-between rounded-xl border border-destructive/10 bg-destructive/[0.02] p-4 text-left transition-all hover:border-destructive/30 hover:bg-destructive/[0.04]">
      <div className="flex items-center gap-3">
        <span className="text-destructive">{icon}</span>
        <span className="text-sm font-semibold text-foreground">{text}</span>
      </div>
      <span className="rounded-lg bg-destructive px-3 py-1.5 text-[11px] font-bold text-white shadow-sm">{cta}</span>
    </button>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm transition-all hover:border-primary/20">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">{label}</p>
      <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">{value}</p>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center rounded-2xl border border-dashed bg-white p-8 text-center shadow-sm">
      <Loader className="mb-4" />
      <div className="text-lg font-semibold text-foreground">Syncing your dashboard...</div>
      <p className="mt-1 text-sm text-muted-foreground">Fetching latest recovery data and signals</p>
    </div>
  )
}

function ErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="rounded-2xl border border-destructive/20 bg-destructive/[0.02] p-8 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="h-6 w-6" />
      </div>
      <h3 className="text-lg font-semibold text-foreground">Sync Failed</h3>
      <p className="mt-1 text-sm text-destructive/80">{error}</p>
      <button onClick={onRetry} className="mt-6 rounded-lg bg-destructive px-6 py-2 text-sm font-bold text-white shadow-sm transition-all hover:opacity-90">
        Try Again
      </button>
    </div>
  )
}

function NoSessionState({ onLogin }: { onLogin: () => void }) {
  return (
    <div className="rounded-2xl border bg-white p-10 text-center shadow-sm">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-warning/10 text-warning">
        <AlertTriangle className="h-6 w-6" />
      </div>
      <h3 className="text-lg font-semibold text-foreground">Session Expired</h3>
      <p className="mt-1 text-sm text-muted-foreground">Please sign in to access your recovery console.</p>
      <button onClick={onLogin} className="mt-6 rounded-lg bg-primary px-6 py-2 text-sm font-bold text-white shadow-sm transition-all hover:opacity-90">
        Go to Login
      </button>
    </div>
  )
}
