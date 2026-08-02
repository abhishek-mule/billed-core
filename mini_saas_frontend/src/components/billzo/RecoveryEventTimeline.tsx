'use client'

import { useEffect, useState } from 'react'
import {
  Loader2, Send, Eye, Bell, Phone, HeartHandshake, CheckCircle2, XCircle,
  FileText, Plus, CreditCard, ExternalLink, Clock, AlertTriangle, MousePointerClick,
} from 'lucide-react'

type TimelineEvent = {
  id: string
  type: string
  title: string
  description?: string
  timestamp: string
  source?: string
  severity?: string
  metadata?: Record<string, unknown>
}

interface RecoveryEventTimelineProps {
  caseId?: string
  customerId?: string
  events?: TimelineEvent[]
  loading?: boolean
  onRefresh?: () => void
  emptyMessage?: string
}

const EVENT_ICONS: Record<string, any> = {
  invoice_created: FileText,
  invoice_sent: Send,
  customer_viewed: Eye,
  payment_link_opened: ExternalLink,
  reminder_scheduled: Clock,
  reminder_sent: Bell,
  reminder_delivered: CheckCircle2,
  reminder_read: Eye,
  reminder_failed: XCircle,
  merchant_called: Phone,
  call_outcome: Phone,
  promise_received: HeartHandshake,
  promise_fulfilled: CheckCircle2,
  promise_broken: XCircle,
  payment_received: CreditCard,
  customer_payment_reported: CreditCard,
  payment_confirmed: CheckCircle2,
  payment_failed: XCircle,
  note_added: Plus,
  case_opened: FileText,
  case_closed: CheckCircle2,
  escalated: AlertTriangle,
  disputed: AlertTriangle,
}

const SEVERITY_COLORS: Record<string, string> = {
  success: 'ok',
  error: 'bad',
  info: 'info',
  neutral: 'neutral',
}

function dateGroupLabel(date: Date): string {
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  if (date.toDateString() === today.toDateString()) return 'Today'
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'

  const diffDays = Math.floor((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays <= 7) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    return days[date.getDay()]
  }

  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function RecoveryEventTimeline({
  caseId,
  customerId,
  events: propEvents,
  loading: propLoading,
  onRefresh,
  emptyMessage = 'No activity yet',
}: RecoveryEventTimelineProps) {
  const [fetchedEvents, setFetchedEvents] = useState<TimelineEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const events = propEvents || fetchedEvents

  useEffect(() => {
    if (propEvents) return
    if (!caseId && !customerId) return

    let active = true
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams()
        if (caseId) params.set('caseId', caseId)
        else if (customerId) params.set('customerId', customerId)
        const res = await fetch(`/api/recovery/timeline?${params}`, { credentials: 'include' })
        if (!res.ok) throw new Error(`API ${res.status}`)
        const json = await res.json()
        if (active) {
          const allEvents = json.days?.flatMap((d: any) => d.items) || []
          setFetchedEvents(allEvents)
        }
      } catch (e: any) {
        if (active) setError(e.message || 'Failed')
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => { active = false }
  }, [caseId, customerId, propEvents])

  const isLoading = propLoading !== undefined ? propLoading : loading

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <AlertTriangle className="h-6 w-6 text-danger mx-auto mb-2" />
        <p className="text-xs text-muted-foreground">{error}</p>
        {onRefresh && (
          <button onClick={onRefresh} className="rc-btn rc-btn--ghost mt-2">
            <Clock size={12} /> Retry
          </button>
        )}
      </div>
    )
  }

  if (events.length === 0) {
    return (
      <div className="text-center py-8">
        <Clock className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
        <p className="text-xs text-muted-foreground">{emptyMessage}</p>
      </div>
    )
  }

  const groups = groupByDay(events)

  return (
    <div className="tls">
      {groups.map((group) => (
        <div key={group.date}>
          <div className="tls-head">
            <span>{dateGroupLabel(new Date(group.date + 'T00:00:00'))}</span>
          </div>
          {group.items.map((event) => {
            const Icon = EVENT_ICONS[event.type] || FileText
            const date = new Date(event.timestamp)
            const timeStr = date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
            const tone = event.severity ? SEVERITY_COLORS[event.severity] || 'neutral' : 'neutral'

            return (
              <div key={event.id} className={`rc-tl-item tl-item--${tone}`}>
                <div className="rc-tl-dot" />
                <div className="rc-tl-body">
                  <span className="rc-tl-text">
                    <Icon size={13} className="tl-ic" />
                    {event.title}
                    {event.description ? (
                      <span className="rc-tl-detail"> · {event.description}</span>
                    ) : null}
                  </span>
                </div>
                <div className="rc-tl-time">{timeStr}</div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

function groupByDay(events: TimelineEvent[]): { date: string; items: TimelineEvent[] }[] {
  const byDay = new Map<string, TimelineEvent[]>()
  for (const e of events) {
    const d = new Date(e.timestamp).toISOString().slice(0, 10)
    const arr = byDay.get(d) || []
    arr.push(e)
    byDay.set(d, arr)
  }
  return [...byDay.entries()]
    .map(([date, items]) => ({ date, items: items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()) }))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}
