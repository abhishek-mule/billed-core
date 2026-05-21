import { useState, useEffect } from 'react'
import { db } from './db'

export type SyncHealth = {
  pendingCount: number
  syncingCount: number
  failedCount: number
  conflictCount: number
  deadLetterCount: number
  totalCount: number
  lastSyncedAt: string | null
}

export function useSyncHealth(tenantId: string | null): { data: SyncHealth; loading: boolean } {
  const [data, setData] = useState<SyncHealth>({
    pendingCount: 0,
    syncingCount: 0,
    failedCount: 0,
    conflictCount: 0,
    deadLetterCount: 0,
    totalCount: 0,
    lastSyncedAt: null,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!tenantId) {
      setLoading(false)
      return
    }

    let active = true

    const checkHealth = async () => {
      try {
        const queue = await db().queue.where('tenantId').equals(tenantId).toArray()
        if (!active) return

        const pendingCount = queue.filter((q) => q.status === 'pending').length
        const syncingCount = queue.filter((q) => q.status === 'syncing').length
        const failedCount = queue.filter((q) => q.status === 'failed').length
        const conflictCount = queue.filter((q) => q.status === 'conflict').length
        const deadLetterCount = queue.filter((q) => q.status === 'dead_letter').length
        const synced = queue.filter((q) => q.status === 'synced')
        const lastSyncedAt = synced.length > 0 ? synced.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0].updatedAt : null

        setData({
          pendingCount,
          syncingCount,
          failedCount,
          conflictCount,
          deadLetterCount,
          totalCount: queue.length,
          lastSyncedAt,
        })
      } catch {
        // ignore
      } finally {
        if (active) setLoading(false)
      }
    }

    checkHealth()

    const handler = () => checkHealth()
    window.addEventListener('billzo:changed', handler)
    const interval = setInterval(checkHealth, 15000)

    return () => {
      active = false
      window.removeEventListener('billzo:changed', handler)
      clearInterval(interval)
    }
  }, [tenantId])

  return { data, loading }
}
