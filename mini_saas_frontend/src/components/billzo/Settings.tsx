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
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/80">Testing mode</p>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Settings</h1>
      </header>

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
            <button className="rounded-lg border border-border bg-white px-4 py-2 text-xs font-bold text-foreground transition-all hover:bg-muted" onClick={() => {}}>Configure</button>
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
                className="rounded-lg border border-border bg-white px-4 py-2 text-xs font-bold text-foreground transition-all hover:bg-muted"
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
