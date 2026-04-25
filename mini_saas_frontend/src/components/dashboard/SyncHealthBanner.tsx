'use client'

import { useEffect, useState } from 'react'
import { RefreshCw, CheckCircle, AlertTriangle, XCircle } from 'lucide-react'
import { dashboardCardBase } from './styles'

interface SyncHealthBannerProps {
  onRetry?: () => void
}

export function SyncHealthBanner({ onRetry }: SyncHealthBannerProps) {
  const [health, setHealth] = useState<{
    failed_count: number
    pending_count: number
    circuit_status: string
    loading: boolean
  }>({
    failed_count: 0,
    pending_count: 0,
    circuit_status: 'connected',
    loading: true
  })

  useEffect(() => {
    async function fetchHealth() {
      try {
        const res = await fetch('/api/merchant/observability')
        if (res.ok) {
          const data = await res.json()
          setHealth({
            failed_count: data.erpStatus?.recentFailures || 0,
            pending_count: 0,
            circuit_status: data.erpStatus?.circuitOpen ? 'open' : 'connected',
            loading: false
          })
        }
      } catch {
        setHealth(prev => ({ ...prev, loading: false }))
      }
    }
    fetchHealth()
    const interval = setInterval(fetchHealth, 30000)
    return () => clearInterval(interval)
  }, [])

  if (health.loading) {
    return (
      <div className={`${dashboardCardBase} px-4 py-3 flex items-center gap-3`}>
        <RefreshCw className="w-4 h-4 animate-spin text-slate-500" />
        <span className="text-sm text-slate-400">Checking sync status...</span>
      </div>
    )
  }

  if (health.circuit_status === 'open') {
    return (
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl px-4 py-3 flex items-center gap-3 transition-all duration-200">
        <AlertTriangle className="w-5 h-5 text-amber-400" />
        <div className="flex-1">
          <p className="text-sm font-medium text-amber-400">ERP Connection Unstable</p>
          <p className="text-xs text-amber-300/70">Invoices will sync automatically when restored</p>
        </div>
      </div>
    )
  }

  if (health.failed_count > 0) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-2xl px-4 py-3 flex items-center gap-3 transition-all duration-200">
        <XCircle className="w-5 h-5 text-red-400" />
        <div className="flex-1">
          <p className="text-sm font-medium text-red-400">{health.failed_count} invoice{health.failed_count > 1 ? 's' : ''} failed to sync</p>
          <p className="text-xs text-red-300/70">Tap to retry</p>
        </div>
        <button 
          onClick={onRetry}
          className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 text-xs font-medium rounded-lg transition-all duration-200 active:scale-95"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl px-4 py-3 flex items-center gap-3 transition-all duration-200">
      <CheckCircle className="w-5 h-5 text-emerald-400" />
      <div className="flex-1">
        <p className="text-sm font-medium text-emerald-400">All synced</p>
        <p className="text-xs text-emerald-300/70">Ready to bill</p>
      </div>
    </div>
  )
}