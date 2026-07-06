"use client"

import React from "react"
import { IndianRupee, TrendingUp, TrendingDown } from "lucide-react"
import { MerchantLanguage } from "@billzo/shared"
import type { AnyDashboardSection, CashSectionPayload, CashMetric } from "@billzo/shared"

function getToneIcon(tone: string) {
  switch (tone) {
    case 'positive': return TrendingUp
    case 'negative': return TrendingDown
    default: return IndianRupee
  }
}

function getToneColor(tone: string) {
  switch (tone) {
    case 'positive': return "text-emerald-600 bg-emerald-50 border-emerald-100"
    case 'negative': return "text-rose-600 bg-rose-50 border-rose-100"
    default: return "text-primary bg-primary/10 border-primary/15"
  }
}

function CashSection({ section }: { section: AnyDashboardSection }) {
  if (section.type !== 'cash') return null
  const payload = section.payload as CashSectionPayload
  const { metrics } = payload

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {metrics.map((metric: CashMetric, i: number) => {
        const showEmptyLabel = metric.emptyLabel && metric.value === '₹0'
        return (
          <div key={i} className="rounded-xl border p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{metric.label}</p>
              <span className={`inline-flex h-6 w-6 items-center justify-center rounded-lg border ${getToneColor(metric.tone)}`}>
                {React.createElement(getToneIcon(metric.tone), { size: 14 })}
              </span>
            </div>
            {showEmptyLabel ? (
              <p className="mt-2 text-sm font-medium text-muted-foreground">{metric.emptyLabel}</p>
            ) : (
              <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">{metric.value}</p>
            )}
            {metric.subtitle && (
              <p className="mt-0.5 text-xs text-muted-foreground whitespace-pre-line">{metric.subtitle}</p>
            )}
          </div>
        )
      })}
    </div>
  )
}

export { CashSection }