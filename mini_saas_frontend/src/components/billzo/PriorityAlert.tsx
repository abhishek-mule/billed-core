"use client"

import Link from "next/link"
import { AlertTriangle, ArrowRight, X } from "lucide-react"
import { formatINR } from "@/lib/utils"
import { useState } from "react"

interface PriorityAlertItem {
  caseId: string
  customerName: string
  amount: number
  overdue: number
  actionType: string
  reasons: { type: string; impact: string }[]
}

interface PriorityAlertProps {
  item: PriorityAlertItem | null
}

export function PriorityAlert({ item }: PriorityAlertProps) {
  const [dismissed, setDismissed] = useState(false)

  if (!item || dismissed) return null

  const reasonText = (() => {
    if (item.reasons.some((r) => r.type === "promise_broken"))
      return "Promise was broken — action needed"
    if (item.overdue > 30) return `${item.overdue} days overdue — escalating`
    if (item.actionType === "call") return "Call recommended — high value"
    return "Requires attention today"
  })()

  return (
    <div className="relative bg-warning-soft border border-warning/30 rounded-xl p-3.5 sm:p-4">
      <button
        onClick={() => setDismissed(true)}
        className="absolute top-3 right-3 text-warning/50 hover:text-warning transition-colors"
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>

      <div className="flex items-start gap-2.5 sm:gap-3">
        <span className="flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-warning/15 text-warning flex-shrink-0">
          <AlertTriangle size={15} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-xs sm:text-sm font-bold text-warning-foreground truncate">{item.customerName}</p>
          <p className="text-xl sm:text-2xl font-bold text-warning-foreground tabular-nums mt-0.5">
            {formatINR(item.amount)}
          </p>
          <p className="text-[11px] sm:text-xs text-warning-foreground/70 mt-1">{reasonText}</p>
        </div>
        <Link
          href={`/recovery/case/${item.caseId}`}
          className="flex items-center gap-1 px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg bg-warning text-warning-foreground text-[11px] sm:text-xs font-bold hover:bg-warning/90 transition-colors flex-shrink-0 self-center"
        >
          Take Action <ArrowRight size={12} />
        </Link>
      </div>
    </div>
  )
}
