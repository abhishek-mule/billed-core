"use client"

import { useMemo } from "react"
import { AlertTriangle, Zap, Flame } from "lucide-react"
import { CustomerCard, type CustomerCardItem } from "./CustomerCard"
import type { DominantAction } from "@/lib/billzo/reminder-state"

interface RecoveryQueueProps {
  items: CustomerCardItem[]
  sendingFor?: string | null
  onSend?: (item: CustomerCardItem) => void
  onCall?: (item: CustomerCardItem) => void
  onPayment?: (item: CustomerCardItem) => void
  onPromise?: (item: CustomerCardItem) => void
  onOpenCustomer?: (item: CustomerCardItem) => void
  dominantOverride?: DominantAction
}

function getTier(item: CustomerCardItem & { confidence: number }): {
  id: string
  icon: React.ReactNode
  label: string
} {
  const isQuickWin =
    item.confidence >= 80 &&
    !item.reasons.some((r) => r.type === "promise_broken") &&
    item.overdue <= 30
  const isFollowUp =
    item.overdue > 30 || item.reasons.some((r) => r.type === "promise_broken")

  if (isFollowUp) return { id: "follow-up", icon: <AlertTriangle size={12} className="text-amber-600" />, label: "At Risk" }
  if (isQuickWin) return { id: "quick-win", icon: <Zap size={12} className="text-emerald-600" />, label: "Quick Win" }
  return { id: "recover-first", icon: <Flame size={12} className="text-orange-600" />, label: "Highest Impact" }
}

export function RecoveryQueue({
  items,
  sendingFor,
  onSend,
  onCall,
  onPayment,
  onPromise,
  onOpenCustomer,
}: RecoveryQueueProps) {
  const ranked = useMemo(() => {
    const withConfidence = items.map((item) => ({
      ...item,
      confidence:
        item.amount > 0
          ? Math.round((item.recoverableAmount / item.amount) * 100)
          : 0,
    }))

    const scored = withConfidence.map((item) => {
      const score = item.recoverableAmount * (item.confidence / 100)
      const urgency = item.overdue > 30 ? 2 : item.overdue > 15 ? 1 : 0
      const penalty = item.reasons.some((r) => r.type === "promise_broken") ? 5000 : 0
      return { ...item, sortScore: score + urgency * 10000 - penalty }
    })

    return scored.sort((a, b) => b.sortScore - a.sortScore)
  }, [items])

  if (ranked.length === 0) return null

  return (
    <div className="space-y-2">
      {ranked.map((item, i) => {
        const tier = getTier(item)

        return (
          <CustomerCard
            key={item.caseId}
            item={item}
            rank={i + 1}
            tierIcon={tier.icon}
            sheet={{
              busy: sendingFor === item.caseId,
              onWhatsApp: onSend ? () => onSend(item) : undefined,
              onCall: onCall ? () => onCall(item) : undefined,
              onRecordPayment: onPayment ? () => onPayment(item) : undefined,
              onPromise: onPromise ? () => onPromise(item) : undefined,
              openHref: onOpenCustomer ? undefined : `/parties/${item.customerId}`,
              onOpenCustomer: onOpenCustomer ? () => onOpenCustomer(item) : undefined,
            }}
          />
        )
      })}
    </div>
  )
}