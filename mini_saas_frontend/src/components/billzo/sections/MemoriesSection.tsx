"use client"

import React from "react"
import { Brain, Clock, MessageSquare, IndianRupee, ShieldCheck, TrendingUp, Lightbulb, Users } from "lucide-react"
import type { AnyDashboardSection, MemoriesSectionPayload, MerchantMemory, BusinessInsight } from "@billzo/shared"

const categoryIcon: Record<string, React.ElementType> = {
  timing: Clock,
  channel: MessageSquare,
  payment: IndianRupee,
  response: MessageSquare,
  reliability: ShieldCheck,
}

function insightIcon(type?: string) {
  switch (type) {
    case 'trend': return TrendingUp
    case 'pattern': return Users
    case 'improvement': return TrendingUp
    default: return Lightbulb
  }
}

function ConfidenceLabel({ memories }: { memories: MerchantMemory[] }) {
  const avgConf = memories.reduce((s, m) => s + m.confidence, 0) / memories.length
  const maxObs = Math.max(...memories.map(m => m.observedPayments ?? 0))
  const obsText = maxObs > 0 ? ` \u00B7 Observed over ${maxObs} payment${maxObs === 1 ? '' : 's'}` : ''
  if (avgConf >= 0.8) {
    return <span className="text-[11px] font-semibold text-emerald-600">Confidence: High{obsText}</span>
  }
  if (avgConf >= 0.6) {
    return <span className="text-[11px] font-semibold text-amber-600">Still learning{obsText}</span>
  }
  return <span className="text-[11px] text-muted-foreground">Still learning this customer</span>
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  if (confidence >= 0.8) {
    return <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20 dark:text-emerald-400 px-1.5 py-0.5 rounded">{Math.round(confidence * 100)}%</span>
  }
  if (confidence >= 0.6) {
    return <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 dark:bg-amber-950/20 dark:text-amber-400 px-1.5 py-0.5 rounded">Still learning</span>
  }
  return null
}

function groupMemoriesByCustomer(memories: MerchantMemory[]): Map<string, MerchantMemory[]> {
  const groups = new Map<string, MerchantMemory[]>()
  for (const m of memories) {
    const key = m.customerName || 'Other'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(m)
  }
  return groups
}

function MemoriesSection({ section }: { section: AnyDashboardSection }) {
  if (section.type !== 'memories') return null
  const payload = section.payload as MemoriesSectionPayload
  const { memories, insights } = payload

  const highConfidenceMemories = memories.filter(m => m.confidence >= 0.6)
  const grouped = groupMemoriesByCustomer(highConfidenceMemories)

  const hasInsights = (insights && insights.length > 0) || false
  const hasMemories = grouped.size > 0

  if (!hasInsights && !hasMemories) {
    return (
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center gap-2 px-4 pt-3.5 pb-2.5 border-b border-border">
          <Brain className="h-4 w-4 text-foreground" />
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">What BillZo Learned</p>
        </div>
        <div className="p-6 text-center">
          <Lightbulb className="mx-auto h-6 w-6 text-muted-foreground/50" />
          <p className="mt-2 text-sm font-medium text-foreground">We're still learning about your customers</p>
          <p className="mt-1 text-xs text-muted-foreground">More insights will appear as payment patterns become clear.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-4 pt-3.5 pb-2.5 border-b border-border">
        <Brain className="h-4 w-4 text-foreground" />
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">What BillZo Learned</p>
      </div>
      <div className="divide-y divide-border">
        {/* Aggregate insights */}
        {hasInsights && (
          <div className="px-4 py-3 space-y-2">
            {insights!.map((insight: BusinessInsight, i: number) => {
              const Icon = insightIcon(insight.type)
              return (
                <div key={i} className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary shrink-0">
                    {React.createElement(Icon, { size: 12 })}
                  </span>
                  <p className="text-sm text-foreground">{insight.observation}</p>
                </div>
              )
            })}
          </div>
        )}

        {/* Per-customer memories */}
        {hasMemories && (
          <div className="divide-y divide-border">
            {Array.from(grouped.entries()).map(([customerName, customerMemories]) => (
              <div key={customerName} className="px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-bold text-foreground">{customerName}</p>
                  <ConfidenceLabel memories={customerMemories} />
                </div>
                <div className="space-y-1">
                  {customerMemories.map((memory: MerchantMemory, i: number) => {
                    const Icon = categoryIcon[memory.category] || Lightbulb
                    return (
                      <div key={i} className="flex items-start gap-2">
                        {React.createElement(Icon, { size: 12, className: "mt-0.5 text-muted-foreground shrink-0" })}
                        <div className="min-w-0">
                          <span className="text-xs text-muted-foreground">{memory.observation.replace(`${customerName} — `, '')}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export { MemoriesSection }