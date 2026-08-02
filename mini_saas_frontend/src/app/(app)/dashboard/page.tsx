"use client"

import { useEffect, useState } from "react"
import { AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react"
import { PageShell } from "@/components/billzo/PageShell"
import { Skeleton } from "@/components/billzo/Skeleton"
import { MorningBrief } from "@/components/billzo/MorningBrief"
import { MissionHeader } from "@/components/billzo/MissionHeader"
import { PriorityAlert } from "@/components/billzo/PriorityAlert"
import { RecoveryQueue } from "@/components/billzo/RecoveryQueue"
import { RecoveryScoreCard } from "@/components/billzo/RecoveryScoreCard"
import type { CustomerCardItem } from "@/components/billzo/CustomerCard"

type ActionItem = {
  caseId: string
  customerId: string
  customerName: string
  phone: string | null
  invoiceNumber?: string | null
  invoiceCount: number
  amount: number
  recoverableAmount: number
  overdue: number
  actionType: string
  state: string
  reasons: { type: string; impact: string }[]
}

type HealthDriver = {
  title: string
  status: "good" | "warning" | "critical"
  impact: "high" | "medium" | "low"
}

type DashboardData = {
  hero: {
    outstanding: number
    customerCount: number
    invoiceCount: number
    bestOpportunity: {
      customerId: string
      caseId: string
      customerName: string
      amount: number
      actionType: string
      phone: string | null
    } | null
  }
  todayPlan: ActionItem[]
  attention: ActionItem[]
  upcoming: { id: string; actionType: string; customerName: string; scheduledAt: string }[]
  health: {
    score: number
    drivers: HealthDriver[]
  }
}

function LoadingSkeleton() {
  return (
    <PageShell>
      <div className="space-y-4 animate-pulse">
        <Skeleton className="h-36 rounded-2xl" />
        <Skeleton className="h-32 rounded-2xl" />
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      </div>
    </PageShell>
  )
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <PageShell>
      <div className="text-center py-12">
        <div className="mx-auto h-12 w-12 rounded-full bg-danger-soft flex items-center justify-center">
          <AlertTriangle className="h-6 w-6 text-danger" />
        </div>
        <p className="mt-4 text-sm text-foreground font-medium">Could not load your dashboard</p>
        <p className="text-xs text-muted-foreground mt-1">Check your connection and try again.</p>
        <button
          onClick={onRetry}
          className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-all"
        >
          <RefreshCw size={14} /> Try again
        </button>
      </div>
    </PageShell>
  )
}

function QueueComplete() {
  return (
    <div className="bg-card border border-border rounded-2xl p-6 text-center space-y-2">
      <div className="text-2xl"><CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" /></div>
      <p className="text-sm font-semibold text-foreground">Today&apos;s queue complete</p>
      <p className="text-xs text-muted-foreground">Expected collection achieved</p>
    </div>
  )
}

function EmptyState() {
  return (
    <PageShell>
      <MorningBrief customerCount={0} expectedToday={0} />
      <div className="bg-card border border-border rounded-2xl p-8 text-center">
        <div className="mx-auto h-12 w-12 rounded-full bg-recovery-soft flex items-center justify-center mb-3">
          <AlertTriangle className="h-6 w-6 text-recovery" />
        </div>
        <p className="text-base font-semibold text-foreground">No outstanding invoices</p>
        <p className="text-sm text-muted-foreground mt-1">
          BillZo will monitor future invoices automatically.
        </p>
      </div>
    </PageShell>
  )
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    setError(false)
    fetch("/api/recovery/workspace", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => {
        setData(d)
        setLoading(false)
      })
      .catch(() => {
        setError(true)
        setLoading(false)
      })
  }

  useEffect(() => {
    load()
  }, [])

  if (error) return <ErrorState onRetry={load} />
  if (loading) return <LoadingSkeleton />
  if (!data || (data.hero.outstanding === 0 && data.todayPlan.length === 0)) return <EmptyState />

  const { hero, todayPlan, health } = data
  const expectedToday = todayPlan.reduce((s, i) => s + i.recoverableAmount, 0)

  const priorityItem = (() => {
    if (todayPlan.length === 0) return null
    const first = todayPlan[0]
    const isUrgent =
      first.overdue > 30 ||
      first.reasons.some((r) => r.type === "promise_broken") ||
      first.actionType === "call"
    return isUrgent ? first : null
  })()

  return (
    <PageShell>
      <div className="space-y-4 pb-8">
        <MorningBrief
          customerCount={hero.customerCount}
          expectedToday={expectedToday}
          bestFirstAction={hero.bestOpportunity}
        />

        <MissionHeader
          outstanding={hero.outstanding}
          expectedToday={expectedToday}
          customerCount={hero.customerCount}
          breakdown={todayPlan.map((i) => ({
            customerId: i.customerId,
            customerName: i.customerName,
            amount: i.amount,
            recoverableAmount: i.recoverableAmount,
            overdue: i.overdue,
          }))}
        />

        {priorityItem && <PriorityAlert item={priorityItem} />}

        {todayPlan.length === 0 ? (
          <QueueComplete />
        ) : (
          <RecoveryQueue items={todayPlan as CustomerCardItem[]} />
        )}

        {todayPlan.length <= 15 && todayPlan.length > 0 && (
          <RecoveryScoreCard score={health.score} drivers={health.drivers} />
        )}
      </div>
    </PageShell>
  )
}
