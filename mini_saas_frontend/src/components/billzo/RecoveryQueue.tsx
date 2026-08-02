"use client"

import { useMemo } from "react"
import { AlertTriangle, Zap, Flame } from "lucide-react"
import { CustomerCard, type CustomerCardItem } from "./CustomerCard"
import { formatINR } from "@/lib/utils"

interface RecoveryQueueProps {
  items: CustomerCardItem[]
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

function formatWhyNow(
  item: CustomerCardItem & { confidence: number },
  tierId: string,
): string {
  if (tierId === "recover-first") {
    const parts: string[] = []
    if (item.recoverableAmount > 5000)
      parts.push(`₹${(item.recoverableAmount / 1000).toFixed(0)}k expected today`)
    if (item.overdue > 0) parts.push(`${item.overdue}d overdue`)
    return parts.join(" · ") || "Best opportunity today"
  }
  if (tierId === "quick-win") {
    return `${item.confidence}% confidence · ${item.recoverableAmount > 0 ? `₹${(item.recoverableAmount / 1000).toFixed(0)}k` : "quick"} recovery`
  }
  if (tierId === "follow-up") {
    const parts: string[] = []
    if (item.overdue > 30) parts.push(`${item.overdue}d overdue`)
    if (item.reasons.some((r) => r.type === "promise_broken")) parts.push("Promise broken")
    return parts.join(" · ") || "Needs attention"
  }
  return ""
}

export function RecoveryQueue({ items }: RecoveryQueueProps) {
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
        const whyNow = formatWhyNow(item, tier.id)

        return (
          <CustomerCard
            key={item.caseId}
            item={item}
            rank={i + 1}
            tierIcon={tier.icon}
            whyNow={whyNow}
          />
        )
      })}
    </div>
  )
}
