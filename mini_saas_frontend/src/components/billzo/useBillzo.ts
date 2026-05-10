'use client'

import { useCallback, useEffect, useState } from 'react'
import { getBillzoState } from '@/lib/billzo/actions'
import { scheduleBackgroundSync } from '@/lib/billzo/sync'

export type BillzoState = NonNullable<Awaited<ReturnType<typeof getBillzoState>>>

interface UseBillzoResult {
  state: BillzoState | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

export function useBillzo(): UseBillzoResult {
  const [state, setState] = useState<BillzoState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const newState = await getBillzoState()
      if (newState === null) {
        setError('Session not found. Please sign in.')
        setState(null)
      } else {
        setState(newState)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load data'
      setError(message)
      console.error('useBillzo error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    scheduleBackgroundSync()

    const onChange = () => refresh()
    const onOnline = () => {
      scheduleBackgroundSync()
      refresh()
    }

    window.addEventListener('billzo:changed', onChange)
    window.addEventListener('online', onOnline)

    return () => {
      window.removeEventListener('billzo:changed', onChange)
      window.removeEventListener('online', onOnline)
    }
  }, [refresh])

  return { state, loading, error, refresh }
}
