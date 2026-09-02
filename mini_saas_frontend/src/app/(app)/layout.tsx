"use client";

import { useEffect } from "react";
import { AppShell } from '@/components/billzo/AppShell'
import { ErrorBoundary } from '@/components/billzo/ErrorBoundary'
import { SessionProvider } from '@/lib/billzo/session'
import { NetworkStatus } from '@/components/billzo/NetworkStatus'
import { scheduleBackgroundSync } from '@/lib/billzo/network-status'
import { syncPendingQueue, reconcileFromServer } from '@/lib/billzo/sync'

export default function BillzoLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const handleOnline = () => scheduleBackgroundSync()
    const handleSync = () => {
      syncPendingQueue().then(() => reconcileFromServer())
    }
    window.addEventListener('online', handleOnline)
    window.addEventListener('billzo:sync', handleSync)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('billzo:sync', handleSync)
    }
  }, [])

  return (
    <ErrorBoundary>
      <SessionProvider>
        <AppShell>{children}</AppShell>
        <NetworkStatus />
      </SessionProvider>
    </ErrorBoundary>
  )
}
