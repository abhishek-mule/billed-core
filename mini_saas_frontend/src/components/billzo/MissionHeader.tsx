"use client"

import { Banknote, Target, TrendingUp } from "lucide-react"
import { formatINR, cn } from "@/lib/utils"

interface MissionHeaderProps {
  outstanding: number
  expectedToday: number
  customerCount: number
}

export function MissionHeader({
  outstanding,
  expectedToday,
  customerCount,
}: MissionHeaderProps) {
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

      <div className="flex items-center gap-2">
        <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-warning-soft text-warning">
          <Target size={12} />
        </span>
        <span className="text-xs font-semibold text-muted-foreground">Expected Today</span>
        <span className="ml-auto text-lg font-bold text-foreground tabular-nums">
          {formatINR(expectedToday)}
        </span>
      </div>

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
