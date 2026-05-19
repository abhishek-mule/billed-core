'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { getBillzoState } from '@/lib/billzo/actions'
import { scheduleBackgroundSync } from '@/lib/billzo/sync'

export type BillzoState = NonNullable<Awaited<ReturnType<typeof getBillzoState>>>

interface UseBillzoResult {
  state: BillzoState | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  liveEvents: Array<{ type: string; data: any; timestamp: number }>
}

export function useBillzo(): UseBillzoResult {
  const [state, setState] = useState<BillzoState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [liveEvents, setLiveEvents] = useState<Array<{ type: string; data: any; timestamp: number }>>([])
  const eventSourceRef = useRef<EventSource | null>(null)

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

  useEffect(() => {
    if (typeof window === 'undefined') return

    const es = new EventSource('/api/events/stream')
    eventSourceRef.current = es

    es.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data)
        setLiveEvents(prev => [...prev.slice(-50), { type: data.type, data, timestamp: Date.now() }])

        if (data.type === 'payment.success' || data.type === 'invoice.created') {
          refresh()
        }
      } catch {
        // ignore parse errors
      }
    })

    es.onerror = () => {
      console.warn('[SSE] Connection lost, reconnecting...')
      es.close()
      setTimeout(() => {
        if (eventSourceRef.current?.readyState === EventSource.CLOSED) {
          // browser will auto-reconnect
        }
      }, 3000)
    }

    return () => {
      es.close()
      eventSourceRef.current = null
    }
  }, [refresh])

  return { state, loading, error, refresh, liveEvents }
}