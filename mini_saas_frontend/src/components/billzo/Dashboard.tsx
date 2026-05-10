'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState, useMemo } from 'react'
import { AlertTriangle, Bell, CheckCircle2, IndianRupee, PackageMinus, RefreshCcw, RotateCcw, ScanLine, Send, TrendingUp, Wallet, Zap } from 'lucide-react'
import { applyWhatsAppStatus, createPurchaseFromScan, getBillzoState, markPaid, repeatLastInvoice, sendReminder, type ActionResult } from '@/lib/billzo/actions'
import { useBillzo } from './useBillzo'

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

export function Dashboard() {
  const router = useRouter()
  const { state, loading, error } = useBillzo()
  const [paywall, setPaywall] = useState<PaywallState>({ show: false })

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

    const overdueCount = invoices.filter((i) => i.status === 'overdue').length

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

  if (loading) return <LoadingState />
  if (error) return <ErrorState error={error} onRetry={() => router.refresh()} />
  if (!state) return <NoSessionState onLogin={() => router.push('/login')} />

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
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Shop Active</p>
          <h1 className="text-2xl font-black">{state.session.businessName}</h1>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-black ${
          state.tenant?.plan === 'pro' || state.tenant?.plan === 'growth'
            ? 'bg-success-soft text-success'
            : 'bg-warning-soft text-warning'
        }`}>
          {state.tenant?.plan || 'starter'} plan
        </span>
      </header>

      {/* RECOVERY HERO SECTION */}
      <section className="grid gap-4 sm:grid-cols-3">
        <div className={`rounded-2xl p-6 ${stats.totalRecovered > 0 ? 'bg-gradient-to-br from-green-500 to-emerald-600' : 'bg-gradient-to-br from-slate-700 to-slate-800'} text-white`}>
          <div className="flex items-center gap-3 mb-3">
            <TrendingUp className="h-6 w-6 opacity-80" />
            <span className="text-sm font-medium opacity-80">Total Recovered</span>
          </div>
          <p className="text-3xl font-black">{money(stats.totalRecovered)}</p>
          <p className="mt-1 text-xs opacity-60">
            {stats.totalRecovered > 0 ? 'Keep it going!' : 'Create invoices to start recovering'}
          </p>
        </div>

        <div className="rounded-2xl border-2 border-warning/30 bg-warning-soft p-6">
          <div className="flex items-center gap-3 mb-3">
            <Wallet className="h-6 w-6 text-warning" />
            <span className="text-sm font-medium text-warning">Pending Amount</span>
          </div>
          <p className="text-3xl font-black text-warning">{money(stats.pendingAmount)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {unpaid.length} invoice{unpaid.length !== 1 ? 's' : ''} pending
          </p>
        </div>

        <div className="rounded-2xl border bg-white p-6">
          <div className="flex items-center gap-3 mb-3">
            <Zap className="h-6 w-6 text-primary" />
            <span className="text-sm font-medium text-muted-foreground">Actions Left</span>
          </div>
          <p className="text-3xl font-black">
            {isFreePlan
              ? `${3 - (state.tenant?.invoiceCount || 0)} invoices · ${5 - (state.tenant?.reminderCount || 0)} reminders`
              : 'Unlimited'}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {isFreePlan ? 'Free plan' : 'Pro plan active'}
          </p>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-4">
        <button onClick={() => router.push('/scan')} className="action-tile bg-foreground text-white sm:col-span-2">
          <ScanLine className="h-6 w-6" />
          <span>Scan Bill</span>
        </button>
        <button onClick={() => handleAction(() => repeatLastInvoice())} className="action-tile">
          <RotateCcw className="h-6 w-6" />
          <span>Repeat Last</span>
        </button>
        <button
          onClick={() => primaryUnpaid && handleAction(() => sendReminder(primaryUnpaid))}
          className="action-tile"
          disabled={!primaryUnpaid}
        >
          <Send className="h-6 w-6" />
          <span>Remind</span>
        </button>
      </section>

      <section className="space-y-3">
        <h2 className="section-label">Needs Attention</h2>
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
          onClick={() => handleAction(() => createPurchaseFromScan())}
        />
      </section>

      <section className="grid gap-3 sm:grid-cols-4">
        <Metric label="Collected today" value={money(stats.collectedToday)} />
        <Metric label="Total invoices" value={String(stats.invoiceCount)} />
        <Metric label="Reminders sent" value={String(stats.reminderCount)} />
        <Metric label="Read reminders" value={String(state.snapshot.readReminderCount)} />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-3">
          <h2 className="section-label">Recovery Queue</h2>
          {unpaid.length === 0 ? (
            <div className="rounded-lg border bg-white p-6 text-center">
              <p className="text-muted-foreground">
                {stats.totalRecovered > 0 ? 'All caught up! 🎉' : 'No pending invoices'}
              </p>
              {stats.totalRecovered === 0 && unpaid.length === 0 && (
                <p className="mt-1 text-sm text-muted-foreground">
                  Send your first invoice to start recovering money
                </p>
              )}
            </div>
          ) : (
            unpaid.slice(0, 4).map((invoice) => (
              <div key={invoice.id} className="row-card">
                <div>
                  <p className="font-black">{invoice.customerName}</p>
                  <p className="text-sm font-bold text-muted-foreground">
                    {money(invoice.total - invoice.paidAmount)} due - {invoice.lastWhatsAppStatus}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    className="icon-button bg-primary text-primary-foreground"
                    onClick={() => handleAction(() => sendReminder(invoice))}
                    title="Send Reminder"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                  <button
                    className="icon-button"
                    onClick={() => applyWhatsAppStatus(invoice, 'read')}
                    title="Simulate Read"
                  >
                    <Bell className="h-4 w-4" />
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
            ))
          )}
        </div>

        <div className="space-y-3">
          <h2 className="section-label">Activity</h2>
          {state.activity.length === 0 ? (
            <div className="rounded-lg border bg-white p-6 text-center">
              <p className="text-muted-foreground">No recent activity</p>
            </div>
          ) : (
            state.activity.slice(0, 6).map((item) => (
              <div key={item.id} className="row-card">
                <div>
                  <p className="text-sm font-black">{item.label}</p>
                  <p className="text-xs font-bold text-muted-foreground">
                    {new Date(item.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                {item.amount ? <span className="text-sm font-black">{money(item.amount)}</span> : null}
              </div>
            ))
          )}
        </div>
      </section>

      {lowStock.length > 0 && (
        <section className="space-y-3">
          <h2 className="section-label">Living Inventory</h2>
          {lowStock.map((product) => (
            <div key={product.id} className="row-card border-warning/40 bg-warning-soft">
              <div>
                <p className="font-black">{product.name}</p>
                <p className="text-sm font-bold text-warning">{product.stock} left - min {product.lowStockAt}</p>
              </div>
              <button className="primary-button" onClick={() => handleAction(() => createPurchaseFromScan())}>
                Restock
              </button>
            </div>
          ))}
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
  const usageType = type === 'invoice' ? 'Create invoice' : 'Send reminder'
  const roiMultiple = recoveredAmount > 0 ? Math.floor(recoveredAmount / 299) : 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-2xl">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-green-500 to-emerald-600 text-white">
          <TrendingUp className="h-8 w-8" />
        </div>

        {recoveredAmount > 0 ? (
          <>
            <h2 className="text-xl font-bold">You recovered {money(recoveredAmount)} using BillZo!</h2>
            <p className="mt-2 text-muted-foreground">
              That's {roiMultiple}x what Pro costs. Unlock unlimited recovery!
            </p>
          </>
        ) : (
          <>
            <h2 className="text-xl font-bold">Unlock {limitType}</h2>
            <p className="mt-2 text-muted-foreground">
              You've reached your free {limitType} limit. Upgrade for unlimited access.
            </p>
          </>
        )}

        <div className="mt-6 flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-lg border py-3 font-medium">
            Maybe Later
          </button>
          <button
            onClick={onUpgrade}
            className="flex-1 rounded-lg bg-gradient-to-r from-green-500 to-emerald-600 py-3 font-medium text-white"
          >
            Upgrade to Pro ₹299/mo
          </button>
        </div>

        <p className="mt-4 text-xs text-muted-foreground">
          Pro: Unlimited invoices & reminders · Auto-recovery · Priority support
        </p>
      </div>
    </div>
  )
}

function Attention({ icon, text, cta, onClick }: { icon: React.ReactNode; text: string; cta: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center justify-between rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-left">
      <span className="flex items-center gap-3 text-lg font-black">{icon}{text}</span>
      <span className="rounded-lg bg-foreground px-3 py-2 text-xs font-black text-white">{cta}</span>
    </button>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-white p-4">
      <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-black">{value}</p>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="rounded-lg border bg-white p-6">
      <div className="mb-3 flex items-center gap-2 font-black">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        Loading...
      </div>
      <p className="text-sm font-bold text-muted-foreground">Fetching your data...</p>
    </div>
  )
}

function ErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-6">
      <div className="mb-3 flex items-center gap-2 font-black text-destructive">
        <AlertTriangle className="h-4 w-4" />
        Something went wrong
      </div>
      <p className="text-sm text-destructive">{error}</p>
      <button onClick={onRetry} className="mt-4 rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-white">
        Try Again
      </button>
    </div>
  )
}

function NoSessionState({ onLogin }: { onLogin: () => void }) {
  return (
    <div className="rounded-lg border bg-white p-6">
      <div className="mb-3 flex items-center gap-2 font-black">
        <AlertTriangle className="h-4 w-4 text-warning" />
        Session Not Found
      </div>
      <p className="text-sm text-muted-foreground">Please sign in to continue.</p>
      <button onClick={onLogin} className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
        Go to Login
      </button>
    </div>
  )
}