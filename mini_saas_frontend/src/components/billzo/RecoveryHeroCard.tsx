"use client"

import { AlertTriangle, CheckCircle2 } from "lucide-react"
import { formatINR } from "@/lib/utils"

interface RecoveryHeroCardProps {
  stuckMoneyTotal: number
  customersNeedingAction: number
  collectedAfterFollowup: number
  casesResolvedThisMonth: number
}

export function RecoveryHeroCard({ 
  stuckMoneyTotal, 
  customersNeedingAction, 
  collectedAfterFollowup, 
  casesResolvedThisMonth 
}: RecoveryHeroCardProps) {
  return (
    <div className="bg-foreground text-background rounded-xl p-6 mb-6">
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-xs font-semibold uppercase tracking-wider opacity-70">
          STUCK MONEY
        </span>
        {customersNeedingAction > 0 && (
          <span className="bg-red-500/20 text-red-300 text-xs font-medium px-2 py-0.5 rounded flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            {customersNeedingAction} customers need attention
          </span>
        )}
        {customersNeedingAction === 0 && (
          <span className="bg-green-500/20 text-green-300 text-xs font-medium px-2 py-0.5 rounded flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            All caught up
          </span>
        )}
      </div>
      <div className="text-4xl font-bold tabular-nums mb-1">
        {formatINR(stuckMoneyTotal)}
      </div>
      <div className="text-sm opacity-60">
        This month: {formatINR(collectedAfterFollowup)} collected · {casesResolvedThisMonth} cases closed
      </div>
    </div>
  )
}