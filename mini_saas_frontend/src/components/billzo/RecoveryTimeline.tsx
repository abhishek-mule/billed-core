"use client"

import { useEffect, useState } from "react"
import { Loader2, Send, Eye, Bell, Phone, HeartHandshake, CheckCircle2, XCircle, FileText, Plus, Clock, CreditCard, ExternalLink } from "lucide-react"
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

const ACTIVITY_LABELS: Record<RecoveryActivityType, string> = {
  invoice_created: 'Invoice Created',
  invoice_sent: 'Invoice Sent',
  customer_viewed: 'Customer Viewed',
  payment_link_opened: 'Payment Link Opened',
  reminder_sent: 'Reminder Sent',
  merchant_called: 'Call Made',
  call_outcome: 'Call Outcome',
  promise_received: 'Promise to Pay',
  promise_fulfilled: 'Promise Fulfilled',
  promise_broken: 'Promise Broken',
  payment_received: 'Payment Received',
  customer_payment_reported: 'Payment Reported',
  payment_confirmed: 'Payment Confirmed',
  note_added: 'Note Added',
}

const ACTOR_LABELS: Record<string, string> = {
  merchant: 'You',
  customer: 'Customer',
  system: 'BillZo',
}

const CALL_OUTCOME_LABEL: Record<string, string> = {
  no_answer: 'No Answer',
  busy: 'Busy',
  answered: 'Answered',
  switched_off: 'Switched Off',
  wrong_number: 'Wrong Number',
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
    <div className="space-y-0">
      {activities.map((activity, i) => {
        const Icon = ACTIVITY_ICONS[activity.type] || FileText
        const isLast = i === activities.length - 1
        const date = new Date(activity.createdAt)
        const today = new Date()
        const dateStr = date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
        const timeStr = date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
        const isToday = date.toDateString() === today.toDateString()

        return (
          <div key={activity.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className="grid h-7 w-7 place-items-center rounded-full bg-secondary">
                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              {!isLast && <div className="w-px flex-1 bg-border" />}
            </div>
            <div className={`pb-5 ${isLast ? '' : ''}`}>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-foreground">{ACTIVITY_LABELS[activity.type] || activity.type}</p>
                <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">
                  {ACTOR_LABELS[activity.actor] || activity.actor}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isToday ? timeStr : `${dateStr}, ${timeStr}`}
              </p>
              {activity.metadata && Object.keys(activity.metadata).length > 0 && (() => {
                const m = activity.metadata as Record<string, unknown>
                return (
                  <div className="mt-1 text-[10px] text-muted-foreground/70 space-y-0.5">
                    {activity.type === 'call_outcome' && typeof m.outcome === 'string' && <p>Outcome: {CALL_OUTCOME_LABEL[m.outcome] || m.outcome.replace(/_/g, ' ')}</p>}
                    {typeof m.amount === 'number' && <p>Amount: ₹{m.amount.toLocaleString('en-IN')}</p>}
                    {typeof m.dueDate === 'string' && <p>Due: {new Date(m.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>}
                    {typeof m.note === 'string' && m.note && <p className="italic">"{m.note}"</p>}
                  </div>
                )
              })()}
            </div>
          </div>
        )
      })}
    </div>
  )
}
