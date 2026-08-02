"use client"

import { cn } from "@/lib/utils"

interface PromiseHealthBadgeProps {
  kept: number
  broken: number
}

export function PromiseHealthBadge({ kept, broken }: PromiseHealthBadgeProps) {
  const total = kept + broken
  const pct = total > 0 ? Math.round((kept / total) * 100) : 0

  const color =
    pct >= 75 ? "text-success" : pct >= 50 ? "text-warning" : "text-danger"
  const barColor =
    pct >= 75 ? "bg-success" : pct >= 50 ? "bg-warning" : "bg-danger"

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground font-medium">Promise Reliability</span>
        <span className={cn("text-xs font-bold tabular-nums", color)}>{pct}%</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", barColor)} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-success" />
          {kept} kept
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-danger" />
          {broken} broken
        </span>
      </div>
    </div>
  )
}
