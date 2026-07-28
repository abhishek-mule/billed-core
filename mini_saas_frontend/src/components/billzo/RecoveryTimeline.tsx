"use client"

import { useEffect, useState } from "react"
import { Loader2, Send, Eye, Bell, Phone, HeartHandshake, CheckCircle2, XCircle, FileText, Plus, CreditCard, ExternalLink, Clock } from "lucide-react"
import type { RecoveryActivity, RecoveryActivityType } from "@/lib/billzo/types"

interface TimelineProps {
  invoiceId: string
}

const ACTIVITY_ICONS: Record<RecoveryActivityType, any> = {
  invoice_created: FileText,
  invoice_sent: Send,
  customer_viewed: Eye,
  payment_link_opened: ExternalLink,
  reminder_sent: Bell,
  merchant_called: Phone,
  call_outcome: Phone,
  promise_received: HeartHandshake,
  promise_fulfilled: CheckCircle2,
  promise_broken: XCircle,
  payment_received: CreditCard,
  customer_payment_reported: CreditCard,
  payment_confirmed: CheckCircle2,
  note_added: Plus,
}

function storyLine(activity: RecoveryActivity): string {
  const m = (activity.metadata || {}) as Record<string, unknown>

  switch (activity.type) {
    case 'invoice_created':
      return typeof m.invoiceRef === 'string' ? `Invoice ${m.invoiceRef} created` : 'Invoice created'
    case 'invoice_sent':
      return 'Invoice sent to customer'
    case 'customer_viewed':
      return 'Customer viewed the invoice'
    case 'payment_link_opened':
      return 'Customer opened the payment link'
    case 'reminder_sent': {
      const ch = typeof m.channel === 'string' ? m.channel : 'reminder'
      return `Reminder sent — ${ch}`
    }
    case 'merchant_called':
      return 'You called'
    case 'call_outcome': {
      const outcome = typeof m.outcome === 'string' ? m.outcome : ''
      const labels: Record<string, string> = {
        no_answer: 'No answer',
        busy: 'Line was busy',
        answered: 'Call was answered',
        switched_off: 'Phone was switched off',
        wrong_number: 'Wrong number',
        promised: 'Promised to pay',
        paid: 'Confirmed payment made',
        dispute: 'Customer disputed the invoice',
        not_interested: 'Customer not interested',
      }
      return labels[outcome] || outcome.replace(/_/g, ' ')
    }
    case 'promise_received': {
      const pd = typeof m.promiseDate === 'string' ? new Date(m.promiseDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''
      return pd ? `Promised payment by ${pd}` : 'Promised to pay'
    }
    case 'promise_fulfilled':
      return 'Promise was kept'
    case 'promise_broken':
      return 'Promise was broken'
    case 'payment_received': {
      const amt = typeof m.amount === 'number' ? `₹${m.amount.toLocaleString('en-IN')}` : ''
      return amt ? `Payment received — ${amt}` : 'Payment received'
    }
    case 'customer_payment_reported': {
      const amt = typeof m.amount === 'number' ? `₹${m.amount.toLocaleString('en-IN')}` : ''
      return amt ? `Customer reported payment — ${amt}` : 'Customer reported payment'
    }
    case 'payment_confirmed': {
      const amt = typeof m.amount === 'number' ? `₹${m.amount.toLocaleString('en-IN')}` : ''
      return amt ? `Payment confirmed — ${amt}` : 'Payment confirmed'
    }
    case 'note_added': {
      const note = typeof m.note === 'string' ? m.note : ''
      return `Note: ${note}`
    }
    default:
      return (activity.type as string).replace(/_/g, ' ')
  }
}

function storyDetail(activity: RecoveryActivity): string | null {
  const m = (activity.metadata || {}) as Record<string, unknown>

  switch (activity.type) {
    case 'call_outcome': {
      const note = typeof m.note === 'string' ? m.note : ''
      return note || null
    }
    case 'invoice_created': {
      const amt = typeof m.amount === 'number' ? `₹${m.amount.toLocaleString('en-IN')}` : ''
      return amt || null
    }
    case 'invoice_sent': {
      const ch = typeof m.channel === 'string' ? m.channel : ''
      return ch ? `via ${ch}` : null
    }
    case 'note_added':
      return null
    default: {
      const note = typeof m.note === 'string' ? m.note : ''
      return note || null
    }
  }
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

function isNewDay(activities: RecoveryActivity[], index: number): boolean {
  if (index === 0) return true
  const curr = new Date(activities[index].createdAt).toDateString()
  const prev = new Date(activities[index - 1].createdAt).toDateString()
  return curr !== prev
}

export function RecoveryTimeline({ invoiceId }: TimelineProps) {
  const [activities, setActivities] = useState<RecoveryActivity[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!invoiceId) return
    const load = async () => {
      try {
        const res = await window.fetch(`/api/recovery/activities?invoiceId=${encodeURIComponent(invoiceId)}`, { credentials: 'include' })
        if (res.ok) {
          const data = await res.json()
          setActivities(data.activities || [])
        }
      } catch {
      } finally {
        setLoading(false)
      }
    }
    load()
    const interval = setInterval(load, 15000)
    return () => clearInterval(interval)
  }, [invoiceId])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (activities.length === 0) {
    return (
      <div className="text-center py-8">
        <Clock className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
        <p className="text-xs text-muted-foreground">No activity yet</p>
        <p className="text-[10px] text-muted-foreground/60 mt-0.5">Activity appears when reminders are sent or payments received</p>
      </div>
    )
  }

  return (
    <div className="tls">
      {activities.map((activity, i) => {
        const Icon = ACTIVITY_ICONS[activity.type] || FileText
        const date = new Date(activity.createdAt)
        const timeStr = date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
        const showDateHeader = isNewDay(activities, i)
        const line = storyLine(activity)
        const detail = storyDetail(activity)
        const isCallOutcome = activity.type === 'call_outcome'

        return (
          <div key={activity.id}>
            {showDateHeader && (
              <div className="tls-head">
                <span>{dateGroupLabel(date)}</span>
              </div>
            )}
            <div className={`tls-row ${isCallOutcome ? 'tls-row--sub' : ''}`}>
              <div className="tls-icon">
                <Icon className="h-3.5 w-3.5" />
              </div>
              <div className="tls-body">
                <p className={`tls-line ${isCallOutcome ? 'tls-line--sub' : ''}`}>
                  {line}
                </p>
                {detail && <p className="tls-detail">{detail}</p>}
                <span className="tls-time">{timeStr}</span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
