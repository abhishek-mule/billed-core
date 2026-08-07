'use client'

import { useState } from 'react'
import { CreditCard, RefreshCcw, ShieldCheck, Smartphone, Wifi } from 'lucide-react'
import { syncPendingQueue } from '@/lib/billzo/actions'
import { useBillzo } from './useBillzo'

export function Settings() {
  const { state } = useBillzo()
  const [pushBusy, setPushBusy] = useState(false)
  if (!state) return null

  const enablePush = async () => {
    setPushBusy(true)
    try {
      const { registerDevice } = await import('@/lib/billzo/notifications')
      if (state.session.tenantId) {
        const success = await registerDevice(state.session.tenantId)
        if (success) alert('Notifications enabled successfully!')
        else alert('Failed to enable notifications. Please check browser permissions and Firebase config.')
      }
    } finally {
      setPushBusy(false)
    }
  }

  const sendTestPush = async () => {
    setPushBusy(true)
    try {
      const response = await fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: state.session.tenantId,
          title: 'BillZo background push works',
          body: 'This notification was sent through Firebase Cloud Messaging.',
          type: 'test_push',
          url: '/dashboard',
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Failed to send test push')
      }

      alert(`Test push sent. Delivered: ${data.deliveredCount || 0}, Failed: ${data.failedCount || 0}`)
    } catch (error: any) {
      alert(error.message || 'Failed to send test push')
    } finally {
      setPushBusy(false)
    }
  }

  return (
    <div className="space-y-8">
      <header>
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/80">Business & System</p>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Settings</h1>
      </header>

      {/* ROI & Subscription Card */}
      <section className="space-y-3">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/80">Subscription & Value Delivered</h2>
        <div className="bg-card border border-border rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Current Plan</p>
              <p className="text-xl font-bold text-foreground mt-0.5 flex items-center gap-2">
                <span>BillZo Pro</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                  ACTIVE
                </span>
              </p>
            </div>
            <a
              href="/pricing"
              className="px-4 py-2 rounded-xl bg-foreground text-background text-xs font-bold hover:bg-foreground/90 transition-colors"
            >
              Manage Subscription
            </a>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-border">
            <div className="p-3 rounded-xl bg-muted/40 border border-border/60">
              <p className="text-[11px] font-medium text-muted-foreground">Recovered with BillZo</p>
              <p className="text-lg font-bold text-emerald-600 tabular-nums mt-0.5">₹18,420</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">This month</p>
            </div>
            <div className="p-3 rounded-xl bg-muted/40 border border-border/60">
              <p className="text-[11px] font-medium text-muted-foreground">Monthly Software Cost</p>
              <p className="text-lg font-bold text-foreground tabular-nums mt-0.5">₹299</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">₹299 / month</p>
            </div>
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <p className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">Return on Investment</p>
              <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 tabular-nums mt-0.5">61x ROI</p>
              <p className="text-[10px] text-emerald-600/80 dark:text-emerald-400/80 mt-0.5">Value delivered</p>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/80">Integrations & System</h2>
        <div className="space-y-3">
          <div className="row-card">
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10 text-success">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Mock login</p>
                <p className="text-xs font-medium text-muted-foreground">{state.session.tenantId}</p>
              </div>
            </div>
            <span className="rounded-full bg-success-soft border border-success/20 px-3 py-1 text-[11px] font-bold text-success uppercase tracking-wide">on</span>
          </div>

          <div className="row-card">
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <CreditCard className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Razorpay</p>
                <p className="text-xs font-medium text-muted-foreground">Payment integration configured</p>
              </div>
            </div>
            <button className="rounded-lg border border-border bg-card px-4 py-2 text-xs font-bold text-foreground transition-all hover:bg-muted" onClick={() => {}}>Configure</button>
          </div>

          <div className="row-card">
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Wifi className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Offline queue</p>
                <p className="text-xs font-medium text-muted-foreground">
                  {state.snapshot.queueCount} pending - {state.snapshot.failedQueueCount} retrying
                </p>
              </div>
            </div>
            <button className="icon-button" onClick={() => syncPendingQueue()}>
              <RefreshCcw className="h-4 w-4" />
            </button>
          </div>

          <div className="row-card">
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Smartphone className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Push Notifications</p>
                <p className="text-xs font-medium text-muted-foreground">Enable alerts for payments & stock</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button 
                className="primary-button" 
                disabled={pushBusy}
                onClick={enablePush}
              >
                {pushBusy ? 'Working...' : 'Enable'}
              </button>
              <button
                className="rounded-lg border border-border bg-card px-4 py-2 text-xs font-bold text-foreground transition-all hover:bg-muted"
                disabled={pushBusy}
                onClick={sendTestPush}
              >
                Test
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-muted/30 p-6">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/80">Supabase RLS Contract</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground font-medium">
          All local records carry tenantId. Sync upserts use idempotency keys and must land in tenant-scoped RLS tables.
        </p>
      </section>
    </div>
  )
}
