'use client'

import { useEffect, useState } from 'react'
import { Server, Wifi, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { dashboardCardInteractive } from './styles'

interface ERPConnectionStatusProps {
  compact?: boolean
}

export function ERPConnectionStatus({ compact = false }: ERPConnectionStatusProps) {
  const [status, setStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking')
  const [lastSync, setLastSync] = useState<string | null>(null)

  useEffect(() => {
    async function checkConnection() {
      try {
        const res = await fetch('/api/health')
        if (res.ok) {
          setStatus('connected')
          setLastSync(new Date().toISOString())
        } else {
          setStatus('disconnected')
        }
      } catch {
        setStatus('disconnected')
      }
    }
    checkConnection()
    const interval = setInterval(checkConnection, 30000)
    return () => clearInterval(interval)
  }, [])

  const statusConfig = {
    checking: { icon: Loader2, color: 'text-slate-400', bg: 'bg-slate-500/20', label: 'Checking...' },
    connected: { icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-500/20', label: 'Connected' },
    disconnected: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-500/20', label: 'Disconnected' }
  }

  const config = statusConfig[status]
  const Icon = config.icon

  if (compact) {
    return (
      <div className={`flex items-center gap-1.5 ${config.color}`}>
        <Icon className={`w-3.5 h-3.5 ${status === 'checking' ? 'animate-spin' : ''}`} />
        <span className="text-xs font-medium">{config.label}</span>
      </div>
    )
  }

  return (
    <div className={dashboardCardInteractive}>
      <div className="flex items-center gap-2 text-slate-400 mb-3">
        <Server className="w-3.5 h-3.5" />
        <span className="text-[11px] font-semibold uppercase tracking-wide">ERP Connection</span>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`p-2 rounded-lg ${config.bg}`}>
            <Icon className={`w-4 h-4 ${config.color} ${status === 'checking' ? 'animate-spin' : ''}`} />
          </div>
          <div>
            <p className={`text-sm font-medium ${config.color}`}>{config.label}</p>
            {lastSync && (
              <p className="text-xs text-slate-500">
                Last checked: {new Date(lastSync).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
              </p>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-1.5">
          <Wifi className="w-4 h-4 text-emerald-500" />
          <span className="text-[11px] text-slate-400">Online</span>
        </div>
      </div>
    </div>
  )
}