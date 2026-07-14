"use client";

import { useEffect, useState } from "react";
import { AppShell } from '@/components/billzo/AppShell'
import { ErrorBoundary } from '@/components/billzo/ErrorBoundary'
import { SplashScreen } from '@/components/billzo/SplashScreen'
import { SessionProvider } from '@/lib/billzo/session'
import { NetworkStatus } from '@/components/billzo/NetworkStatus'
import { scheduleBackgroundSync } from '@/lib/billzo/network-status'
import { syncPendingQueue, reconcileFromServer } from '@/lib/billzo/sync'

export default function BillzoLayout({ children }: { children: React.ReactNode }) {
  const [showApp, setShowApp] = useState(false)

  useEffect(() => {
    const handleOnline = () => scheduleBackgroundSync()
    window.addEventListener('online', handleOnline)
    window.addEventListener('billzo:sync', () => {
      syncPendingQueue().then(() => reconcileFromServer())
    })

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('billzo:sync', handleOnline)
    }
  }, [])

  if (!showApp) {
    return <SplashScreen onComplete={() => setShowApp(true)} />
  }

  return (
    <ErrorBoundary>
      <SessionProvider>
        <AppShell>{children}</AppShell>
        <NetworkStatus />
      </SessionProvider>
    </ErrorBoundary>
  )
}
