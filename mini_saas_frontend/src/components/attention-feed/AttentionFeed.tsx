'use client'

import { useState, useEffect, useCallback } from 'react'
import { AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react'
import { SituationCard } from './SituationCard'

type SituationsResponse = {
  situations: any[]
  total: number
}

export function AttentionFeed() {
  const [situations, setSituations] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [acting, setActing] = useState<string | null>(null)
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)

  const fetchSituations = useCallback(async () => {
    try {
      setError(null)
      const res = await fetch('/api/situations?state=active&limit=20', {
        credentials: 'include',
      })
      if (!res.ok) {
        if (res.status === 401) throw new Error('Session expired')
        throw new Error(`Request failed (${res.status})`)
      }
      const data: SituationsResponse = await res.json()
      setSituations(data.situations || [])
      setLastRefreshed(new Date())
    } catch (err: any) {
      setError(err.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSituations()
  }, [fetchSituations])

  const handleAction = useCallback(async (id: string, action: string) => {
    setActing(id)
    try {
      const res = await fetch('/api/situations', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ situationId: id, action }),
      })
      if (!res.ok) throw new Error('Action failed')
      setSituations(prev => prev.filter(s => s.id !== id))
    } catch (err: any) {
      setError(err.message)
    } finally {
      setActing(null)
    }
  }, [])

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="animate-pulse rounded-2xl border border-border bg-card p-5">
            <div className="flex items-start gap-4">
              <div className="h-10 w-10 rounded-xl bg-muted" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-3/4 rounded bg-muted" />
                <div className="h-3 w-1/2 rounded bg-muted" />
              </div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-red-400" />
        <p className="mt-2 text-sm font-semibold text-red-700">{error}</p>
        <button
          onClick={fetchSituations}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-red-100 px-3 py-1.5 text-xs font-bold text-red-600 transition active:scale-95"
        >
          <RefreshCw className="h-3 w-3" /> Retry
        </button>
      </div>
    )
  }

  if (situations.length === 0) {
    return (
      <div className="rounded-2xl border border-green-200 bg-green-50 p-8 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-green-400" />
        <h3 className="mt-3 text-sm font-bold text-green-700">All clear</h3>
        <p className="mt-1 text-xs text-green-600">
          No situations need your attention right now.
        </p>
        {lastRefreshed && (
          <p className="mt-4 text-[11px] text-green-500">
            Checked {lastRefreshed.toLocaleTimeString()}
          </p>
        )}
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-muted-foreground">
          {situations.length} situation{situations.length !== 1 ? 's' : ''} need attention
          {lastRefreshed ? ` · ${lastRefreshed.toLocaleTimeString()}` : ''}
        </p>
        <button
          onClick={fetchSituations}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-secondary transition"
        >
          <RefreshCw className="h-3 w-3" /> Refresh
        </button>
      </div>

      <div className="space-y-3">
        {situations.map(s => {
          const customerName = extractCustomerName(s)
          const drillHref = s.situation_type === 'payment_anomaly'
            ? '/pulse'
            : customerName
              ? `/cashflow?q=${encodeURIComponent(customerName)}`
              : undefined
          return (
            <SituationCard
              key={s.id}
              situation={s}
              onAction={handleAction}
              acting={acting === s.id}
              drillDownHref={drillHref}
            />
          )
        })}
      </div>
    </div>
  )
}

function extractCustomerName(situation: any): string | null {
  const headline = situation.headline || ''
  const narrative = situation.narrative || ''

  const namePattern = /(?:from|for)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/
  const headlineMatch = headline.match(namePattern)
  if (headlineMatch) return headlineMatch[1]

  const narrativeMatch = narrative.match(namePattern)
  if (narrativeMatch) return narrativeMatch[1]

  return null
}
