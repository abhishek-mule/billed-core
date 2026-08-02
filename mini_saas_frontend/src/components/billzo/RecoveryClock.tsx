"use client"

import { cn } from "@/lib/utils"
import { Clock } from "lucide-react"

interface RecoveryClockProps {
  overdueDays: number
}

export function RecoveryClock({ overdueDays }: RecoveryClockProps) {
  const isBehind = overdueDays > 30
  const isWarning = overdueDays > 15 && overdueDays <= 30
  const isNormal = overdueDays <= 15

  const color = isBehind ? "text-danger" : isWarning ? "text-warning" : "text-muted-foreground"
  const bgColor = isBehind ? "bg-danger-soft" : isWarning ? "bg-warning-soft" : "bg-muted"
  const label = isBehind ? "Behind" : isWarning ? "At Risk" : "On Track"

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <Clock size={14} className={color} />
        <span className="text-xs text-muted-foreground font-medium">Outstanding</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className={cn("text-lg font-bold tabular-nums", color)}>
          {overdueDays}d
        </span>
        <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded", bgColor, color)}>
          {label}
        </span>
      </div>
      {overdueDays > 15 && (
        <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-1">
          <div
            className={cn("h-full rounded-full", isBehind ? "bg-danger" : "bg-warning")}
            style={{ width: `${Math.min(100, (overdueDays / 60) * 100)}%` }}
          />
        </div>
      )}
    </div>
  )
}
