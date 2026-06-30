"use client";

import { useEffect, useState } from "react";
import { AppShell } from '@/components/billzo/AppShell'
import { ErrorBoundary } from '@/components/billzo/ErrorBoundary'
import { LoadingScreen } from '@/components/billzo/LoadingScreen'
import { SessionProvider } from '@/lib/billzo/session'

export default function BillzoLayout({ children }: { children: React.ReactNode }) {
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  if (!isMounted) {
    return <LoadingScreen />
  }

  return (
    <ErrorBoundary>
      <SessionProvider>
        <AppShell>{children}</AppShell>
      </SessionProvider>
    </ErrorBoundary>
  )
}
