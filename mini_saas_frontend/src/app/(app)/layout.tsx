"use client";

import { useEffect, useState } from "react";
import { AppShell } from '@/components/billzo/AppShell'
import { ErrorBoundary } from '@/components/billzo/ErrorBoundary'
import { LoadingScreen } from '@/components/billzo/LoadingScreen'
import { SessionProvider } from '@/lib/billzo/session'
import { NetworkStatus } from '@/components/billzo/NetworkStatus'
import { scheduleBackgroundSync } from '@/lib/billzo/network-status'
import { syncPendingQueue, reconcileFromServer } from '@/lib/billzo/sync'

export default function BillzoLayout({ children }: { children: React.ReactNode }) {
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)

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

  if (!isMounted) {
    return <LoadingScreen />
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
