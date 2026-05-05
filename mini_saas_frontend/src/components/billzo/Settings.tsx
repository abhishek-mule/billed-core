'use client'

import { RefreshCcw, ShieldCheck, Smartphone, Wifi } from 'lucide-react'
import { syncPendingQueue, unlockPaywallWithRazorpayTest } from '@/lib/billzo/actions'
import { useBillzo } from './useBillzo'

export function Settings() {
  const { state } = useBillzo()
  if (!state) return null

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
              <p className="text-sm font-bold text-muted-foreground">TEST MODE only - success/failure simulated</p>
            </div>
          </div>
          <button className="primary-button" onClick={() => unlockPaywallWithRazorpayTest('success')}>Unlock</button>
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
