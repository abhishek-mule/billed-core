"use client"

import React, { useState } from "react"
import { AlertCircle, CheckCircle2, Clock, IndianRupee, Loader2, MessageSquare, Phone } from "lucide-react"
import type { AnyDashboardSection, TodaySectionPayload, WorkItem, WorkAction } from "@billzo/shared"

function getActionIcon(type: string) {
  switch (type) {
    case 'receive_payment': return IndianRupee
    case 'send_reminder': return MessageSquare
    case 'call': return Phone
    case 'review': return AlertCircle
    case 'wait': return Clock
    default: return AlertCircle
  }
}

function getSeverityTone(severity: string) {
  switch (severity) {
    case 'critical': return "text-rose-600 bg-rose-50 border-rose-100 dark:bg-rose-950/20 dark:border-rose-900/30"
    case 'high': return "text-amber-700 bg-amber-50 border-amber-100 dark:bg-amber-950/20 dark:border-amber-900/30"
    case 'normal': return "text-sky-600 bg-sky-50 border-sky-100 dark:bg-sky-950/20 dark:border-sky-900/30"
    case 'low': return "text-emerald-600 bg-emerald-50 border-emerald-100 dark:bg-emerald-950/20 dark:border-emerald-900/30"
    default: return "text-primary bg-primary/10 border-primary/15"
  }
}

async function performAction(
  action: WorkAction,
  item: WorkItem,
) {
  switch (action) {
    case 'send_reminder': {
      await fetch('/api/recovery/queue/actions', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseId: item.id,
          action: 'send_reminder',
          customerId: item.customerId,
        }),
      })
      break
    }
    case 'call': {
      if (item.customerPhone) {
        window.location.href = `tel:${item.customerPhone}`
      }
      break
    }
    case 'receive_payment': {
      window.location.href = `/udhar?customerId=${item.customerId}`
      break
    }
    case 'review': {
      window.location.href = `/parties/${item.customerId}`
      break
    }
    default:
      break
  }
}

function TodaySection({ section }: { section: AnyDashboardSection & { type: 'today'; payload: TodaySectionPayload } }) {
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const { items, empty } = section.payload

  const handleAction = async (item: WorkItem, actionType: WorkAction) => {
    const key = `${item.id}:${actionType}`
    setActionLoading(key)
    try {
      await performAction(actionType, item)
    } finally {
      setActionLoading(null)
    }
  }

  if (items.length === 0 && empty) {
    const [recoveryHeadline, ...actionBullets] = empty.autoActions || []
    return (
      <div className="rounded-xl border border-dashed border-border p-5">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-500 shrink-0" />
          <div>
            <p className="text-sm font-bold">{empty.headline}</p>
            {empty.subtitle && (
              <p className="mt-1 text-xs text-muted-foreground">{empty.subtitle}</p>
            )}
            {recoveryHeadline && (
              <div className="mt-3 space-y-1">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">BillZo is currently:</p>
                <p className="text-sm font-bold text-foreground">{recoveryHeadline}</p>
                {actionBullets.length > 0 && (
                  <ul className="space-y-0.5 mt-2">
                    {actionBullets.map((item, i) => (
                      <li key={i} className="text-xs text-muted-foreground list-disc list-inside marker:text-emerald-500">
                        {item}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {empty.statusFallback && !empty.nextAction && (
              <div className="mt-3 pt-2 border-t border-dashed border-border">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Automation status</p>
                <p className="mt-1 text-xs font-medium text-foreground">{empty.statusFallback.headline}</p>
                <p className="text-xs text-muted-foreground">{empty.statusFallback.subtitle}</p>
              </div>
            )}
            {empty.nextAction && (
              <div className="mt-3 pt-2 border-t border-dashed border-border">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Next automatic action</p>
                <p className="mt-1 text-xs font-semibold text-foreground">
                  {empty.nextAction.when} &middot; {empty.nextAction.label} &rarr; {empty.nextAction.customerName}
                </p>
                {empty.nextAction.reason && (
                  <p className="text-xs text-muted-foreground">{empty.nextAction.reason}</p>
                )}
                {empty.scheduleLink && (
                  <a href={empty.scheduleLink} className="mt-1 inline-flex text-[11px] font-semibold text-primary hover:underline">
                    View Schedule &rarr;
                  </a>
                )}
              </div>
            )}
            {empty.action && (
              <a
                href="/udhar"
                className="mt-4 inline-flex items-center gap-1.5 h-8 px-3.5 rounded-lg bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 transition-colors"
              >
                {empty.action.label}
              </a>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="divide-y divide-border">
      {items.map((item: WorkItem) => {
        const isPrimaryBusy = actionLoading === `${item.id}:${item.primaryAction.type}`
        const isSecondaryBusy = item.secondaryAction && actionLoading === `${item.id}:${item.secondaryAction.type}`
        return (
          <div key={item.id} className="py-4 first:pt-0 last:pb-0">
            <div className="flex items-start gap-3">
              <span className={`mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-xl border ${getSeverityTone(item.severity)}`}>
                {React.createElement(getActionIcon(item.primaryAction.type), { size: 17 })}
              </span>
              <div className="min-w-0 flex-1">
                <div className="block text-sm font-bold text-foreground">{item.headline}</div>
                <button
                  onClick={() => handleAction(item, item.primaryAction.type)}
                  disabled={isPrimaryBusy}
                  className="mt-1 inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-[10.5px] font-bold uppercase tracking-wide text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
                >
                  {isPrimaryBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : React.createElement(getActionIcon(item.primaryAction.type), { size: 12 })}
                  {item.primaryAction.label}
                </button>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{item.reason}</p>
                {item.secondaryAction && (
                  <button
                    onClick={() => handleAction(item, item.secondaryAction!.type)}
                    disabled={isSecondaryBusy}
                    className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline disabled:opacity-50"
                  >
                    {isSecondaryBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                    {item.secondaryAction.label}
                  </button>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export { TodaySection }