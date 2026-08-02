"use client"

import { useState } from "react"
import { Banknote, Target, TrendingUp, ChevronDown, ChevronUp } from "lucide-react"
import { formatINR, cn } from "@/lib/utils"

export type RecoveryBreakdownItem = {
  customerId: string
  customerName: string
  amount: number
  recoverableAmount: number
  overdue: number
}

interface MissionHeaderProps {
  outstanding: number
  expectedToday: number
  customerCount: number
  breakdown?: RecoveryBreakdownItem[]
}

export function MissionHeader({
  outstanding,
  expectedToday,
  customerCount,
  breakdown,
}: MissionHeaderProps) {
  const [showBreakdown, setShowBreakdown] = useState(false)
  const remaining = expectedToday
  const pct = outstanding > 0 ? Math.round((expectedToday / outstanding) * 100) : 0

  return (
    <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-recovery-soft text-recovery">
            <Banknote size={14} />
          </span>
          <span className="text-sm font-semibold text-foreground">Outstanding</span>
        </div>
        <span className="text-2xl font-bold text-foreground tabular-nums">
          {formatINR(outstanding)}
        </span>
      </div>

      <div className="h-px bg-border" />

      <button
        type="button"
        onClick={() => setShowBreakdown((v) => !v)}
        className={cn(
          "w-full flex items-center gap-2 text-left rounded-lg",
          breakdown && breakdown.length > 0 ? "hover:bg-muted/50 transition-colors px-1 -mx-1" : "cursor-default",
        )}
      >
        <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-warning-soft text-warning">
          <Target size={12} />
        </span>
        <span className="text-xs font-semibold text-muted-foreground">Today&apos;s Recovery Target</span>
        <span className="ml-auto text-lg font-bold text-foreground tabular-nums">
          {formatINR(expectedToday)}
        </span>
        {breakdown && breakdown.length > 0 ? (
          showBreakdown ? <ChevronUp size={14} className="text-muted-foreground flex-shrink-0" /> : <ChevronDown size={14} className="text-muted-foreground flex-shrink-0" />
        ) : null}
      </button>
      <p className="text-[11px] text-muted-foreground -mt-1 px-1">
        Estimated from today&apos;s queue — {formatINR(expectedToday)} of {formatINR(outstanding)} outstanding is expected today
      </p>

      {showBreakdown && breakdown && breakdown.length > 0 && (
        <div className="space-y-1.5 border border-border rounded-xl p-2.5 bg-muted/30">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1">
            Why this amount · per customer
          </p>
          {breakdown.map((b) => (
            <a
              key={b.customerId}
              href={`/recovery/customer/${b.customerId}`}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted transition-colors"
            >
              <div className="flex-1 min-w-0">
                <span className="block text-xs font-medium text-foreground truncate">{b.customerName}</span>
                <span className="block text-[10px] text-muted-foreground">
                  {b.overdue > 0 ? `${b.overdue} day${b.overdue !== 1 ? "s" : ""} overdue` : "due now"} · {formatINR(b.amount)} outstanding
                </span>
              </div>
              <span className="text-sm font-semibold text-recovery tabular-nums">
                {formatINR(b.recoverableAmount)}
              </span>
            </a>
          ))}
          <p className="text-[10px] text-muted-foreground px-1 pt-1">
            Sum = {formatINR(breakdown.reduce((s, b) => s + b.recoverableAmount, 0))} · shown per customer as &ldquo;Expected today&rdquo;
          </p>
        </div>
      )}

      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full rounded-full bg-recovery transition-all"
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </div>

      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span>₹0 recovered</span>
        <span className="ml-auto font-semibold text-foreground tabular-nums">
          {formatINR(remaining)} remaining
        </span>
      </div>

      <div className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-lg text-xs",
        expectedToday > 0
          ? "bg-recovery-soft text-recovery font-medium"
          : "bg-muted text-muted-foreground",
      )}>
        <TrendingUp size={12} />
        {customerCount} customer{customerCount !== 1 ? "s" : ""} in queue
      </div>
    </div>
  )
}
