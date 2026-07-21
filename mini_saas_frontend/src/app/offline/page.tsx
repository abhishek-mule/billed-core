'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { RefreshCw, Wifi } from 'lucide-react'
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
      <div className="flex min-h-dvh flex-col items-center justify-center px-6 bg-white">
        <div className="grid h-16 w-16 place-items-center rounded-full bg-success-soft text-success mb-6">
          <Wifi className="h-8 w-8" />
        </div>
        <h1 className="text-xl font-black text-foreground">You&apos;re back online</h1>
        <p className="mt-1 mb-6 text-sm text-muted-foreground text-center max-w-xs">
          Your connection has been restored.
        </p>
        <button
          onClick={handleRetry}
          disabled={retrying}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
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
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 bg-white">
      <Image
        src="/error_page.png"
        alt="Offline"
        width={320}
        height={320}
        className="w-64 h-64 object-contain mb-6"
        priority
      />
      <h1 className="text-xl font-black text-foreground">You&apos;re offline</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground text-center max-w-xs">
        No worries — BillZo still works offline. Your changes will sync automatically when you&apos;re back online.
      </p>
      <button
        onClick={handleRetry}
        disabled={retrying}
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        <RefreshCw className={`h-4 w-4 ${retrying ? 'animate-spin' : ''}`} />
        Try again
      </button>
    </div>
  )
}
