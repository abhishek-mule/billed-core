'use client'

import { useState, useEffect } from 'react'
import {
  CheckCircle2, Clock, AlertCircle, MessageCircle, CreditCard, FileText,
  Loader2, AlertTriangle, Banknote, Phone, XCircle,
} from 'lucide-react'
import type { RecoveryTimelineData, RecoveryTimelineEvent } from '@billzo/shared'

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
  return new Date(ts).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })
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

  const events = data.events
  const isPaid = events.some(e => e.type === 'payment_received' || e.type === 'case_closed')
  const reminder = data.journey.stages.find(s => s.key === 'reminder_sent')
  const read = data.journey.stages.find(s => s.key === 'customer_read')
  const payment = data.journey.stages.find(s => s.key === 'payment_received')

  // Current state — derived only from recorded evidence (never predicted).
  const blocked = reminder?.status === 'skipped' || events.some(e => e.type === 'reminder_failed')
  const delivered = events.some(e => e.type === 'reminder_delivered')
  const readEvent = events.some(e => e.type === 'reminder_read')
  const escalated = events.some(e => e.type === 'escalated')

  // Most recent actionable event with a timestamp — the honest "last action".
  const lastEvent = [...events]
    .filter(e => e.timestamp)
    .sort((a, b) => +new Date(b.timestamp) - +new Date(a.timestamp))[0]

  let stateTitle = 'Follow-up required'
  let stateTone = 'bg-amber-100 text-amber-800'
  if (isPaid) { stateTitle = 'Recovered'; stateTone = 'bg-green-100 text-green-700' }
  else if (blocked) { stateTitle = 'Blocked'; stateTone = 'bg-red-100 text-red-700' }
  else if (readEvent) { stateTitle = 'Read, awaiting response'; stateTone = 'bg-blue-100 text-blue-700' }
  else if (delivered) { stateTitle = 'Delivered, awaiting read'; stateTone = 'bg-blue-100 text-blue-700' }

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="px-5 pt-5 pb-4">
        <h3 className="font-semibold text-sm">Recovery</h3>

        {/* Current state */}
        <div className={`mt-3 rounded-xl px-4 py-3 flex items-center gap-2.5 ${stateTone}`}>
          {isPaid ? <CheckCircle2 className="h-4 w-4 shrink-0" />
            : blocked ? <XCircle className="h-4 w-4 shrink-0" />
            : escalated ? <AlertTriangle className="h-4 w-4 shrink-0" />
            : <Clock className="h-4 w-4 shrink-0" />}
          <div>
            <div className="text-sm font-bold uppercase tracking-wide">{stateTitle}</div>
            <div className="text-xs opacity-80">{blocked ? reminder?.note : `Invoice ${isPaid ? 'paid' : 'unpaid'}`}</div>
          </div>
        </div>

        {/* Last action — the actual most recent recorded event */}
        {lastEvent && (
          <div className="mt-3 rounded-xl border border-border p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Last action</div>
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="text-sm font-medium capitalize">{lastEvent.title}</span>
              <span className="text-xs text-muted-foreground shrink-0">{formatTime(lastEvent.timestamp)}</span>
            </div>
            {lastEvent.description && (
              <div className="text-xs text-muted-foreground mt-0.5">{lastEvent.description}</div>
            )}
          </div>
        )}

        {/* Reminder status — strict vocabulary */}
        <div className="mt-3 rounded-xl border border-border p-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Reminder</div>
          <div className="mt-1 flex items-center gap-2 text-sm">
            <StatusMarker ok={delivered || readEvent || isPaid} bad={blocked} />
            <span className="font-medium">
              {isPaid ? 'Sent' : blocked ? 'Not sent' : readEvent ? 'Read' : delivered ? 'Delivered' : reminder ? reminder.note : 'Not started'}
            </span>
          </div>
          {blocked && <div className="text-xs text-red-600 mt-0.5">{reminder?.note}</div>}
        </div>

        {/* Payment status — only recorded evidence */}
        <div className="mt-3 rounded-xl border border-border p-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Payment</div>
          <div className="mt-1 flex items-center gap-2 text-sm">
            <StatusMarker ok={isPaid} bad={false} />
            <span className="font-medium">{isPaid ? 'Received' : 'Not received'}</span>
          </div>
        </div>
      </div>

      {/* Factual event history — no invented future milestones */}
      {data.groups.length > 0 && (
        <div className="border-t border-border">
          <div className="px-5 py-3">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Activity</h4>
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

// ── Status marker ──

function StatusMarker({ ok, bad }: { ok: boolean; bad: boolean }) {
  if (bad) return <XCircle className="h-4 w-4 text-red-600" />
  if (ok) return <CheckCircle2 className="h-4 w-4 text-green-600" />
  return <Clock className="h-4 w-4 text-muted-foreground" />
}

// ── Event Row ──

function EventRow({ event }: { event: RecoveryTimelineEvent }) {
  const icon = eventIcon[event.type] || <Clock className="h-4 w-4" />
  const bg = severityBg[event.severity] || 'bg-muted text-muted-foreground'

  return (
    <div className="flex items-start gap-3 py-1.5">
      <div className={`p-1.5 rounded-full shrink-0 ${bg}`}>{icon}</div>
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
