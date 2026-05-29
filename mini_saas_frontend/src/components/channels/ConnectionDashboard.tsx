'use client'

import { useState, useEffect, useCallback } from 'react'
import { Wifi, WifiOff, Loader2, AlertCircle, RefreshCw, Smartphone, MessageCircle, Signal, Activity } from 'lucide-react'

type Channel = {
  id: string
  channel_type: string
  provider: string
  phone_number: string | null
  display_name: string | null
  connection_state: string
  quality_score: number | null
  delivery_success_rate: number | null
  last_heartbeat_at: string | null
  last_connected_at: string | null
  is_active: boolean
  created_at: string
}

function stateIcon(state: string) {
  switch (state) {
    case 'connected':
      return <Wifi className="h-4 w-4 text-green-600" />
    case 'connecting':
    case 'reconnecting':
      return <Loader2 className="h-4 w-4 animate-spin text-amber-600" />
    case 'degraded':
    case 'rate_limited':
      return <AlertCircle className="h-4 w-4 text-amber-600" />
    case 'auth_expired':
    case 'banned':
      return <AlertCircle className="h-4 w-4 text-red-600" />
    default:
      return <WifiOff className="h-4 w-4 text-slate-400" />
  }
}

function stateLabel(state: string) {
  switch (state) {
    case 'connected': return 'Connected'
    case 'connecting': return 'Connecting'
    case 'degraded': return 'Degraded'
    case 'rate_limited': return 'Rate Limited'
    case 'reconnecting': return 'Reconnecting'
    case 'auth_expired': return 'Auth Expired'
    case 'disconnected': return 'Disconnected'
    case 'banned': return 'Banned'
    case 'shadow': return 'Shadow Ban'
    default: return state
  }
}

function stateColor(state: string) {
  switch (state) {
    case 'connected': return 'bg-green-100 text-green-700'
    case 'connecting':
    case 'reconnecting': return 'bg-amber-100 text-amber-700'
    case 'degraded':
    case 'rate_limited': return 'bg-orange-100 text-orange-700'
    case 'auth_expired':
    case 'banned':
    case 'shadow': return 'bg-red-100 text-red-700'
    default: return 'bg-slate-100 text-slate-600'
  }
}

function providerIcon(provider: string) {
  switch (provider) {
    case 'baileys': return <Smartphone className="h-4 w-4" />
    case 'gupshup': return <MessageCircle className="h-4 w-4" />
    default: return <Signal className="h-4 w-4" />
  }
}

function qualityBar(score: number | null) {
  if (score === null || score === undefined) return null
  const pct = Math.round(score * 100)
  const color = pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-slate-200 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-medium text-muted-foreground w-8 text-right">{pct}%</span>
    </div>
  )
}

function timeAgo(dateStr: string | null) {
  if (!dateStr) return 'never'
  const ms = Date.now() - new Date(dateStr).getTime()
  const min = Math.floor(ms / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  return `${day}d ago`
}

export default function ConnectionDashboard() {
  const [channels, setChannels] = useState<Channel[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  const fetchChannels = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/channels', { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to fetch channels')
      const data = await res.json()
      setChannels(data.channels || [])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { fetchChannels() }, [fetchChannels])

  const handleRefresh = () => {
    setRefreshing(true)
    fetchChannels(true)
  }

  const handleDisconnect = async (channelId: string) => {
    try {
      await fetch(`/api/channels/${channelId}/disconnect`, { method: 'POST', credentials: 'include' })
      fetchChannels(true)
    } catch {}
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      </div>
    )
  }

  const connected = channels.filter(c => c.connection_state === 'connected').length
  const total = channels.length

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="p-4 flex items-center justify-between border-b border-border">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-secondary text-primary">
            <Activity className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-semibold">Channel Health</div>
            <div className="text-xs text-muted-foreground">
              {total === 0 ? 'No channels configured' : `${connected}/${total} channels connected`}
            </div>
          </div>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="p-2 rounded-lg hover:bg-muted/60 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 text-muted-foreground ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {total === 0 ? (
        <div className="p-8 text-center">
          <WifiOff className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">No messaging channels configured yet</p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Add a channel in WhatsApp settings to see health data
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {channels.map(ch => (
            <div key={ch.id} className="p-4 hover:bg-muted/20 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${
                    ch.provider === 'gupshup' ? 'bg-green-100 text-green-600' : 'bg-indigo-100 text-indigo-600'
                  }`}>
                    {providerIcon(ch.provider)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold truncate">
                        {ch.display_name || ch.phone_number || `${ch.provider} channel`}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none flex items-center gap-1 ${stateColor(ch.connection_state)}`}>
                        {stateIcon(ch.connection_state)}
                        {stateLabel(ch.connection_state)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-xs text-muted-foreground capitalize">{ch.provider} · {ch.channel_type}</span>
                      {ch.phone_number && <span className="text-xs text-muted-foreground">{ch.phone_number}</span>}
                      {ch.last_heartbeat_at && (
                        <span className="text-xs text-muted-foreground/60">
                          heartbeat {timeAgo(ch.last_heartbeat_at)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {ch.connection_state === 'connected' && (
                  <button
                    onClick={() => handleDisconnect(ch.id)}
                    className="shrink-0 text-[11px] text-red-500 hover:text-red-700 hover:underline font-medium"
                  >
                    Disconnect
                  </button>
                )}
              </div>

              {(ch.quality_score !== null || ch.delivery_success_rate !== null) && (
                <div className="mt-3 grid grid-cols-2 gap-4">
                  {ch.quality_score !== null && (
                    <div>
                      <div className="text-[11px] text-muted-foreground mb-0.5">Quality</div>
                      {qualityBar(ch.quality_score)}
                    </div>
                  )}
                  {ch.delivery_success_rate !== null && (
                    <div>
                      <div className="text-[11px] text-muted-foreground mb-0.5">Delivery Rate</div>
                      {qualityBar(ch.delivery_success_rate)}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
