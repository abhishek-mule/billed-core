"use client"

import { Phone, MessageSquare, ArrowUpRight, AlertTriangle, Clock } from "lucide-react"
import { formatINR, cn } from "@/lib/utils"
import { MoneyJourney } from "./MoneyJourney"
import { PromiseHealthBadge } from "./PromiseHealthBadge"
import { RecoveryClock } from "./RecoveryClock"

interface TimelineEntry {
  type: string
}

interface WorkspaceHeroProps {
  customerName: string
  customerPhone?: string
  outstanding: number
  overdueDays: number
  priority: string
  recommendation?: {
    nextBestAction: string
    urgency: string
    reason: string
  } | null
  metrics: {
    reminderCount: number
    callCount: number
    promiseCount: number
    promiseBrokenCount: number
  }
  timeline?: TimelineEntry[]
  onCall?: () => void
  onSendReminder?: () => void
  onRecordOutcome?: () => void
}

function computeJourneySteps(timeline?: TimelineEntry[]) {
  const types = new Set((timeline || []).map((t) => t.type))
  const hasReminder = types.has("reminder_sent") || types.has("reminder_scheduled")
  const hasViewed =
    types.has("customer_viewed") || types.has("reminder_read") || types.has("payment_link_opened")
  const hasCalled = types.has("merchant_called") || types.has("call_outcome")
  const hasPromise = types.has("promise_received")
  const hasPaid = types.has("payment_received") || types.has("payment_confirmed")

  return [
    { label: "Invoice", done: true },
    { label: "Reminder", done: hasReminder, current: !hasReminder },
    { label: "Viewed", done: hasViewed, current: hasReminder && !hasViewed },
    { label: "Called", done: hasCalled, current: hasViewed && !hasCalled },
    { label: "Promise", done: hasPromise, current: hasCalled && !hasPromise },
    { label: "Paid", done: hasPaid, current: hasPromise && !hasPaid },
  ]
}

function priorityBadge(priority: string) {
  if (priority === "high")
    return { label: "High Priority", className: "bg-danger-soft text-danger" }
  if (priority === "medium")
    return { label: "Medium Priority", className: "bg-warning-soft text-warning" }
  return { label: "Low Priority", className: "bg-muted text-muted-foreground" }
}

function recommendationActionLabel(action: string, hasPhone: boolean): string {
  if (action === "update_contact") return hasPhone ? "Update Contact" : "Add Number"
  const labels: Record<string, string> = {
    call: "Call Today",
    visit: "Visit Customer",
    follow_up: "Follow Up",
    send_reminder: "Send Reminder",
  }
  return labels[action] || action.replace(/_/g, " ")
}

export function WorkspaceHero({
  customerName,
  customerPhone,
  outstanding,
  overdueDays,
  priority,
  recommendation,
  metrics,
  timeline,
  onCall,
  onSendReminder,
  onRecordOutcome,
}: WorkspaceHeroProps) {
  const steps = computeJourneySteps(timeline)
  const badge = priorityBadge(priority)
  const hasPhone = !!customerPhone

  const renderActionBtn = () => {
    if (!recommendation) return null
    const action = recommendation.nextBestAction

    if (action === "call") {
      return (
        <a
          href={hasPhone ? `tel:${customerPhone}` : "#"}
          onClick={onCall}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-primary text-primary-foreground hover:opacity-90 transition-opacity shadow-sm"
        >
          <Phone size={13} />
          Call Today
          <ArrowUpRight size={13} />
        </a>
      )
    }

    if (action === "send_reminder") {
      return (
        <button
          onClick={onSendReminder || onRecordOutcome}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-sm"
        >
          <MessageSquare size={13} />
          Send Reminder
          <ArrowUpRight size={13} />
        </button>
      )
    }

    if (action === "update_contact" && !hasPhone) {
      return (
        <button
          onClick={onRecordOutcome}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-danger-soft text-danger hover:bg-danger/20 transition-colors shadow-sm"
        >
          Add Phone Number
          <ArrowUpRight size={13} />
        </button>
      )
    }

    return (
      <button
        onClick={onRecordOutcome}
        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-primary text-primary-foreground hover:opacity-90 transition-opacity shadow-sm"
      >
        {recommendationActionLabel(action, hasPhone)}
        <ArrowUpRight size={13} />
      </button>
    )
  }

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="p-5 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-foreground">{customerName}</h1>
            {customerPhone && (
              <a
                href={`tel:${customerPhone}`}
                className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-recovery transition-colors mt-0.5"
              >
                <Phone size={12} />
                {customerPhone}
              </a>
            )}
          </div>
          <span
            className={cn(
              "inline-flex items-center px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider",
              badge.className,
            )}
          >
            {badge.label}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Customer Balance</p>
              <p className="text-2xl font-bold text-foreground tabular-nums mt-0.5">
                {formatINR(outstanding)}
              </p>
            </div>
            <RecoveryClock overdueDays={overdueDays} />
          </div>

          <div className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground font-medium mb-1">Payment Chance</p>
              {recommendation && (
                <div className="space-y-1">
                  {renderActionBtn()}
                  {recommendation.nextBestAction === "update_contact" && !hasPhone && (
                    <p className="text-[11px] text-danger leading-relaxed">
                      No phone number — can&apos;t send reminders until added
                    </p>
                  )}
                  <p className="text-[11px] text-muted-foreground leading-relaxed pt-0.5">
                    {recommendation.reason}
                  </p>
                </div>
              )}
              {!recommendation && (
                <p className="text-xs text-muted-foreground mt-1">No recommendation available</p>
              )}
            </div>
          </div>
        </div>

        {metrics.promiseCount > 0 && (
          <div className="pt-2">
            <PromiseHealthBadge kept={metrics.promiseCount - metrics.promiseBrokenCount} broken={metrics.promiseBrokenCount} />
          </div>
        )}

        <div className="pt-2">
          <MoneyJourney steps={steps} />
        </div>

        {overdueDays > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-warning-soft text-warning text-xs font-medium">
            <Clock size={12} />
            {overdueDays} day{overdueDays !== 1 ? "s" : ""} overdue
            {overdueDays > 30 && (
              <span className="ml-auto font-semibold flex items-center gap-1">
                <AlertTriangle size={12} /> Behind schedule
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
