'use client'

import { useEffect, useState, useCallback } from 'react'
import { Wifi, WifiOff, RefreshCw } from 'lucide-react'
import { onNetworkChange, isOnline, listenForBackgroundSync } from '@/lib/billzo/network-status'
import { db } from '@/lib/billzo/db'

export function NetworkStatus() {
  const [online, setOnline] = useState(true)
  const [pendingCount, setPendingCount] = useState(0)

  const updatePendingCount = useCallback(async () => {
    try {
      const tenantId = localStorage.getItem('tenantId')
      if (!tenantId) return
      const count = await db()
        .queue.where('[tenantId+status]')
        .anyOf([tenantId, 'pending'], [tenantId, 'failed'], [tenantId, 'conflict'])
        .count()
      setPendingCount(count)
    } catch {
      setPendingCount(0)
    }
  }, [])

  useEffect(() => {
    setOnline(isOnline())
    updatePendingCount()

    const unsub = onNetworkChange((online) => {
      setOnline(online)
      if (online) updatePendingCount()
    })

    const handleSync = () => updatePendingCount()
    window.addEventListener('billzo:sync', handleSync)
    window.addEventListener('billzo:changed', handleSync)

    listenForBackgroundSync()

    const interval = setInterval(updatePendingCount, 10000)

    return () => {
      unsub()
      window.removeEventListener('billzo:sync', handleSync)
      window.removeEventListener('billzo:changed', handleSync)
      clearInterval(interval)
    }
  }, [updatePendingCount])

  if (online && pendingCount === 0) return null

  return (
    <div className="fixed bottom-4 left-4 z-50">
      <div
        className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium shadow-lg backdrop-blur-sm transition-all ${
          online
            ? 'bg-emerald-500/90 text-white'
            : 'bg-amber-500/90 text-white'
        }`}
      >
        {online ? (
          <>
            <RefreshCw className="h-3 w-3 animate-spin" />
            <span>Syncing ({pendingCount})</span>
          </>
        ) : (
          <>
            <WifiOff className="h-3 w-3" />
            <span>Offline — changes will sync</span>
          </>
        )}
      </div>
    </div>
  )
}
