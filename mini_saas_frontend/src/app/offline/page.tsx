'use client'

import { useEffect, useState } from 'react'
import { WifiOff, Wifi, RefreshCw } from 'lucide-react'
import { isOnline } from '@/lib/billzo/network-status'

export default function OfflinePage() {
  const [online, setOnline] = useState(true)
  const [retrying, setRetrying] = useState(false)

  useEffect(() => {
    setOnline(isOnline())
    const onOnline = () => setOnline(true)
    const onOffline = () => setOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  const handleRetry = () => {
    if (!isOnline()) return
    setRetrying(true)
    window.location.href = '/dashboard'
  }

  if (online) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
        <div className="grid h-16 w-16 place-items-center rounded-full bg-success-soft text-success">
          <Wifi className="h-8 w-8" />
        </div>
        <h1 className="mt-5 text-xl font-black">You're back online</h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-xs">
          Your connection has been restored. Tap below to continue.
        </p>
        <button
          onClick={handleRetry}
          disabled={retrying}
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-success px-6 py-2.5 text-sm font-semibold text-white hover:bg-success disabled:opacity-50 transition-colors"
        >
          {retrying ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <Wifi className="h-4 w-4" />
          )}
          {retrying ? 'Redirecting...' : 'Go to Dashboard'}
        </button>
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <div className="grid h-16 w-16 place-items-center rounded-full bg-warning-soft text-warning">
        <WifiOff className="h-8 w-8" />
      </div>
      <h1 className="mt-5 text-xl font-black">You're offline</h1>
      <p className="mt-2 text-sm text-muted-foreground max-w-xs">
        No worries — BillZo still works offline. Create invoices, add customers, record payments — everything saves locally and syncs automatically when you're back online.
      </p>
      <button
        onClick={handleRetry}
        disabled={retrying}
        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-warning px-6 py-2.5 text-sm font-semibold text-white hover:bg-warning disabled:opacity-50 transition-colors"
      >
        <RefreshCw className={`h-4 w-4 ${retrying ? 'animate-spin' : ''}`} />
        Try again
      </button>
    </div>
  )
}
