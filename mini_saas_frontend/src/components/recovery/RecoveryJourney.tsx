'use client'

import { useState, useEffect } from 'react'
import { CheckCircle2, Clock, AlertCircle, MessageCircle, CreditCard, FileText, Loader2, AlertTriangle, Banknote } from 'lucide-react'
import type { RecoveryTimelineData, RecoveryTimelineEvent, RecoveryJourneyStage } from '@billzo/shared'

// ── Props ──

interface RecoveryJourneyProps {
  invoiceId: string
}

// ── Icon per event type ──

const eventIcon: Record<string, React.ReactNode> = {
  invoice_created: <FileText className="h-4 w-4" />,
  reminder_scheduled: <Clock className="h-4 w-4" />,
  reminder_sent: <MessageCircle className="h-4 w-4" />,
  reminder_delivered: <CheckCircle2 className="h-4 w-4" />,
  reminder_read: <CheckCircle2 className="h-4 w-4" />,
  reminder_failed: <AlertCircle className="h-4 w-4" />,
  payment_link_clicked: <Banknote className="h-4 w-4" />,
  payment_received: <CreditCard className="h-4 w-4" />,
  escalated: <AlertTriangle className="h-4 w-4" />,
  action_pending: <Clock className="h-4 w-4" />,
  case_closed: <CheckCircle2 className="h-4 w-4" />,
}

// ── Severity colors ──

const severityBg: Record<string, string> = {
  success: 'bg-green-100 text-green-700',
  info: 'bg-blue-100 text-blue-700',
  warning: 'bg-amber-100 text-amber-700',
  error: 'bg-red-100 text-red-700',
  future: 'bg-muted text-muted-foreground',
}

// ── Stage icon ──

function stageIcon(status: string) {
  switch (status) {
    case 'completed': return <CheckCircle2 className="h-5 w-5 text-green-600" />
    case 'current': return <div className="h-5 w-5 rounded-full border-2 border-blue-500 bg-blue-50 flex items-center justify-center"><div className="h-2 w-2 rounded-full bg-blue-500" /></div>
    case 'pending': return <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30" />
    default: return <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30" />
  }
}

function stageColor(status: string): string {
  switch (status) {
    case 'completed': return 'text-green-700'
    case 'current': return 'text-blue-700 font-semibold'
    case 'pending': return 'text-muted-foreground/50'
    default: return 'text-muted-foreground/50'
  }
}

// ── Timestamp formatting ──

function formatTime(ts: string): string {
  const d = new Date(ts)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })
  if (isToday) return `Today • ${time}`
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday • ${time}`
  return `${d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })} • ${time}`
}

function formatTimeShort(ts: string): string {
  const d = new Date(ts)
  return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })
}

// ── Main component ──

export default function RecoveryJourney({ invoiceId }: RecoveryJourneyProps) {
  const [data, setData] = useState<RecoveryTimelineData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadJourney()
  }, [invoiceId])

  const loadJourney = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/recovery/journey/${invoiceId}`, { credentials: 'include' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setData(json)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">Recovery data unavailable</p>
      </div>
    )
  }

  const isPaid = data.events.some(e => e.type === 'payment_received' || e.type === 'case_closed')

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">Recovery Journey</h3>
          {isPaid && (
            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
              Recovered
            </span>
          )}
          {!isPaid && data.events.some(e => e.type === 'escalated') && (
            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
              Escalated
            </span>
          )}
        </div>
      </div>

      {/* Progress Stepper */}
      <div className="px-5 pb-4">
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-[10px] top-2 bottom-2 w-0.5 bg-border" />

          {data.journey.stages.map((stage, idx) => (
            <div key={stage.key} className="flex items-start gap-3 relative pb-4 last:pb-0">
              <div className="relative z-10 bg-card shrink-0">
                {stageIcon(stage.status)}
              </div>
              <div className="flex-1 min-w-0 pt-0.5">
                <div className={`text-sm ${stageColor(stage.status)}`}>
                  {stage.label}
                </div>
                {stage.timestamp && (
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {formatTime(stage.timestamp)}
                  </div>
                )}
                {stage.status === 'current' && !isPaid && (
                  <div className="text-xs text-blue-600 mt-0.5 font-medium">
                    In progress
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Intelligence Insights */}
      {data.insights && data.insights.length > 0 && (
        <div className="px-5 pb-3 space-y-2">
          {data.insights.map(insight => (
            <div
              key={insight.id}
              className={`rounded-xl p-3 text-xs ${
                insight.severity === 'positive' ? 'bg-green-50 border border-green-200' :
                insight.severity === 'negative' ? 'bg-red-50 border border-red-200' :
                'bg-blue-50 border border-blue-200'
              }`}
            >
              <div className="flex items-start gap-2">
                {insight.severity === 'positive' ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-600 mt-0.5 shrink-0" />
                ) : insight.severity === 'negative' ? (
                  <AlertCircle className="h-3.5 w-3.5 text-red-600 mt-0.5 shrink-0" />
                ) : (
                  <Clock className="h-3.5 w-3.5 text-blue-600 mt-0.5 shrink-0" />
                )}
                <div>
                  <div className={`font-semibold ${
                    insight.severity === 'positive' ? 'text-green-800' :
                    insight.severity === 'negative' ? 'text-red-800' :
                    'text-blue-800'
                  }`}>
                    {insight.title}
                  </div>
                  <div className={
                    insight.severity === 'positive' ? 'text-green-700' :
                    insight.severity === 'negative' ? 'text-red-700' :
                    'text-blue-700'
                  }>
                    {insight.description}
                    {insight.confidence !== undefined && (
                      <span className="ml-1 opacity-70">
                        ({Math.round(insight.confidence * 100)}% confidence)
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Event Log */}
      {data.groups.length > 0 && (
        <div className="border-t border-border">
          <div className="px-5 py-3">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Event History</h4>
          </div>
          <div className="px-5 pb-5 space-y-4">
            {data.groups.map(group => (
              <div key={group.label}>
                <div className="text-xs font-semibold text-muted-foreground mb-2">{group.label}</div>
                <div className="space-y-2">
                  {group.events.map(event => (
                    <EventRow key={event.id} event={event} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Event Row ──

function EventRow({ event }: { event: RecoveryTimelineEvent }) {
  const icon = eventIcon[event.type] || <Clock className="h-4 w-4" />
  const bg = severityBg[event.severity] || 'bg-muted text-muted-foreground'

  return (
    <div className="flex items-start gap-3 py-1.5">
      <div className={`p-1.5 rounded-full shrink-0 ${bg}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">{event.title}</span>
          <span className="text-xs text-muted-foreground shrink-0">{formatTimeShort(event.timestamp)}</span>
        </div>
        {event.description && (
          <div className="text-xs text-muted-foreground mt-0.5">{event.description}</div>
        )}
        {event.reason && (
          <div className="text-xs text-muted-foreground/60 mt-0.5 italic">{event.reason}</div>
        )}
      </div>
    </div>
  )
}
