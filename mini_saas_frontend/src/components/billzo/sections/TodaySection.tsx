"use client"

import React from "react"
import { formatINR } from "@/lib/utils"
import { AlertCircle, CheckCircle2, Clock, IndianRupee, MessageSquare, Phone } from "lucide-react"
import { MerchantLanguage } from "@billzo/shared"
import type { AnyDashboardSection, TodaySectionPayload, WorkItem } from "@billzo/shared"

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

function TodaySection({ section }: { section: AnyDashboardSection & { type: 'today'; payload: TodaySectionPayload } }) {
  const { items, empty } = section.payload

  if (items.length === 0 && empty) {
    return (
      <div className="rounded-xl border border-dashed border-border p-8 text-center">
        <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />
        <p className="mt-3 text-sm font-bold">{empty.headline}</p>
        {empty.action && (
          <button className="mt-5 inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-primary text-primary-foreground text-xs font-semibold">
            {empty.action.label}
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="divide-y divide-border">
      {items.map((item: WorkItem) => (
        <div key={item.id} className="py-4 first:pt-0 last:pb-0">
          <div className="flex items-start gap-3">
            <span className={`mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-xl border ${getSeverityTone(item.severity)}`}>
              {React.createElement(getActionIcon(item.primaryAction.type), { size: 17 })}
            </span>
            <div className="min-w-0 flex-1">
              <div className="block text-sm font-bold text-foreground">{item.headline}</div>
              <div className="mt-1 inline-flex rounded-full bg-muted px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
                {item.primaryAction.label}
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{item.reason}</p>
              {item.secondaryAction && (
                <button className="mt-2 text-xs font-semibold text-primary hover:underline">
                  {item.secondaryAction.label}
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export { TodaySection }