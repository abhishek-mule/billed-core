'use client'

import { useState } from 'react'
import { RefreshCcw, ShieldCheck, Smartphone, Wifi } from 'lucide-react'
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
    <div className="space-y-6">
      <header>
        <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Testing mode</p>
        <h1 className="text-2xl font-black">Settings</h1>
      </header>

      <section className="space-y-3">
        <div className="row-card">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-success" />
            <div>
              <p className="font-black">Mock login</p>
              <p className="text-sm font-bold text-muted-foreground">{state.session.tenantId}</p>
            </div>
          </div>
          <span className="rounded-full bg-success-soft px-3 py-1 text-xs font-black text-success">on</span>
        </div>
        <div className="row-card">
          <div className="flex items-center gap-3">
            <Smartphone className="h-5 w-5" />
            <div>
              <p className="font-black">Razorpay</p>
              <p className="text-sm font-bold text-muted-foreground">Payment integration configured</p>
            </div>
          </div>
          <button className="primary-button" onClick={() => {}}>Configure</button>
        </div>
        <div className="row-card">
          <div className="flex items-center gap-3">
            <Wifi className="h-5 w-5" />
            <div>
              <p className="font-black">Offline queue</p>
              <p className="text-sm font-bold text-muted-foreground">
                {state.snapshot.queueCount} pending - {state.snapshot.failedQueueCount} retrying
              </p>
            </div>
          </div>
          <button className="primary-button" onClick={() => syncPendingQueue()}>
            <RefreshCcw className="h-4 w-4" />
          </button>
        </div>
        <div className="row-card">
          <div className="flex items-center gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
            <div>
              <p className="font-black">Push Notifications</p>
              <p className="text-sm font-bold text-muted-foreground">Enable alerts for payments & stock</p>
            </div>
          </div>
          <button 
            className="primary-button" 
            disabled={pushBusy}
            onClick={enablePush}
          >
            {pushBusy ? 'Working...' : 'Enable'}
          </button>
          <button
            className="primary-button"
            disabled={pushBusy}
            onClick={sendTestPush}
          >
            Test
          </button>
        </div>
      </section>

      <section className="rounded-lg border bg-white p-4">
        <p className="section-label">Supabase RLS Contract</p>
        <p className="mt-2 text-sm font-bold text-muted-foreground">
          All local records carry tenantId. Sync upserts use idempotency keys and must land in tenant-scoped RLS tables.
        </p>
      </section>
    </div>
  )
}
