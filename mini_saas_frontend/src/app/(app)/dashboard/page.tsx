"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  AlertTriangle, RefreshCw, Phone, Send, UserPlus,
  ChevronRight, ArrowRight, Banknote, Receipt, TrendingUp, Zap,
  CheckCircle2, X, Clock, Users, Target,
} from "lucide-react"
import { PageShell } from "@/components/billzo/PageShell"
import { Skeleton } from "@/components/billzo/Skeleton"
import { formatINR } from "@/lib/utils"

type HomeData = {
  financial: {
    totalOutstanding: number
    inRecovery: number
    recoveredThisMonth: number
  }
  recoveryFocus: {
    amount: number
    customerCount: number
  }
  recoveryPerformance: {
    recovered: number
    totalOutstanding: number
    rate: number
  }
  sections: {
    needsYou: number
    automated: number
    monitoring: number
  }
  exceptions: {
    missingPhone: number
    brokenPromises: number
    failedReminders: number
    paymentToReview: number
  }
  generatedAt: string
}

function LoadingSkeleton() {
  return (
    <PageShell>
      <div className="space-y-4 animate-pulse">
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
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
        <p className="mt-4 text-sm text-foreground font-medium">Could not load your business summary</p>
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

export default function DashboardPage() {
  const [data, setData] = useState<HomeData | null>(null)
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)
  const [autoEnabled, setAutoEnabled] = useState<boolean | null>(null)

  const load = () => {
    setLoading(true)
    setError(false)
    fetch("/api/recovery/home", { credentials: "include" })
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
    fetch("/api/settings/auto-recovery", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && typeof d.enabled === "boolean") setAutoEnabled(d.enabled) })
      .catch(() => {})
  }, [])

  if (error) return <ErrorState onRetry={load} />
  if (loading) return <LoadingSkeleton />

  const financial = data?.financial ?? { totalOutstanding: 0, inRecovery: 0, recoveredThisMonth: 0 }
  const recoveryFocus = data?.recoveryFocus ?? { amount: 0, customerCount: 0 }
  const recoveryPerformance = data?.recoveryPerformance ?? { recovered: 0, totalOutstanding: 0, rate: 0 }
  const sections = data?.sections ?? { needsYou: 0, automated: 0, monitoring: 0 }
  const exceptions = data?.exceptions ?? { missingPhone: 0, brokenPromises: 0, failedReminders: 0, paymentToReview: 0 }

  const greeting = (() => {
    const h = new Date().getHours()
    if (h < 12) return "Good morning"
    if (h < 17) return "Good afternoon"
    return "Good evening"
  })()

  const totalExceptions = exceptions.missingPhone + exceptions.brokenPromises + exceptions.failedReminders + exceptions.paymentToReview

  return (
    <PageShell>
      <div className="space-y-6 pb-8">
        {/* Business overview header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">
              {greeting}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Here's how your money is doing
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/recovery"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-xs font-semibold bg-card hover:bg-muted"
            >
              <Zap className={`h-3.5 w-3.5 ${autoEnabled ? "text-emerald-500" : "text-muted-foreground"}`} />
              Recovery
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${autoEnabled ? "bg-emerald-500" : "bg-muted-foreground"}`} />
              {autoEnabled === null ? "..." : autoEnabled ? "On" : "Off"}
            </Link>
            <button
              onClick={load}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-xs font-medium text-muted-foreground bg-card hover:bg-muted"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Financial overview cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-card border border-border rounded-2xl p-5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
              <Banknote size={14} />
              <span className="uppercase tracking-wider font-semibold">Outstanding</span>
            </div>
            <p className="text-2xl font-bold tabular-nums tracking-tight text-foreground">
              {formatINR(financial.totalOutstanding)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Total unpaid</p>
          </div>

          <div className="bg-card border border-border rounded-2xl p-5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
              <Send size={14} />
              <span className="uppercase tracking-wider font-semibold">Recovery Focus</span>
            </div>
            <p className="text-2xl font-bold tabular-nums tracking-tight text-foreground">
              {formatINR(recoveryFocus.amount)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">{recoveryFocus.customerCount} customer{recoveryFocus.customerCount !== 1 ? 's' : ''} need action</p>
          </div>

          <div className="bg-card border border-border rounded-2xl p-5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
              <TrendingUp size={14} />
              <span className="uppercase tracking-wider font-semibold">Recovered</span>
            </div>
            <p className="text-2xl font-bold tabular-nums tracking-tight text-success">
              {formatINR(financial.recoveredThisMonth)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">This month</p>
          </div>
        </div>

        {/* Recovery performance */}
        {recoveryFocus.customerCount > 0 && (
          <div className="bg-card border border-border rounded-2xl p-5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
              <Zap size={14} />
              <span className="uppercase tracking-wider font-semibold">Recovery Performance</span>
            </div>
            <div className="space-y-3">
              <div>
                <div className="flex items-baseline justify-between mb-1">
                  <span className="text-lg font-bold text-foreground">{formatINR(recoveryPerformance.recovered)}</span>
                  <span className="text-xs text-muted-foreground">recovered this month</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-success rounded-full transition-all"
                    style={{ width: `${recoveryPerformance.rate}%` }}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between text-sm pt-2 border-t border-border">
                <span className="text-muted-foreground">{recoveryFocus.customerCount} customers in recovery</span>
                <div className="flex items-center gap-3 text-xs">
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                    {sections.automated} automated
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                    {sections.monitoring} monitoring
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                    {sections.needsYou} need you
                  </span>
                </div>
              </div>
              <Link
                href="/recovery"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity w-full justify-center"
              >
                View Recovery Command Center <ArrowRight size={15} />
              </Link>
            </div>
          </div>
        )}

        {/* Needs attention - exceptions */}
        {totalExceptions > 0 && (
          <div className="bg-danger-soft border border-danger/20 rounded-2xl p-5">
            <div className="flex items-center gap-2 text-xs text-danger mb-3">
              <AlertTriangle size={14} />
              <span className="uppercase tracking-wider font-semibold">Needs Your Attention</span>
            </div>
            <div className="space-y-2">
              {exceptions.missingPhone > 0 && (
                <Link href="/recovery" className="flex items-center gap-2 text-sm text-foreground hover:text-danger transition-colors">
                  <UserPlus size={14} className="text-danger flex-shrink-0" />
                  <span>{exceptions.missingPhone} customer{exceptions.missingPhone > 1 ? "s" : ""} missing phone number</span>
                </Link>
              )}
              {exceptions.brokenPromises > 0 && (
                <Link href="/recovery" className="flex items-center gap-2 text-sm text-foreground hover:text-danger transition-colors">
                  <X size={14} className="text-danger flex-shrink-0" />
                  <span>{exceptions.brokenPromises} payment promise{exceptions.brokenPromises > 1 ? "s" : ""} broken</span>
                </Link>
              )}
              {exceptions.failedReminders > 0 && (
                <Link href="/recovery" className="flex items-center gap-2 text-sm text-foreground hover:text-danger transition-colors">
                  <Phone size={14} className="text-danger flex-shrink-0" />
                  <span>{exceptions.failedReminders} reminder{exceptions.failedReminders > 1 ? "s" : ""} failed to deliver</span>
                </Link>
              )}
              {exceptions.paymentToReview > 0 && (
                <Link href="/recovery" className="flex items-center gap-2 text-sm text-foreground hover:text-danger transition-colors">
                  <Target size={14} className="text-danger flex-shrink-0" />
                  <span>{exceptions.paymentToReview} possible payment{exceptions.paymentToReview > 1 ? "s" : ""} to review</span>
                </Link>
              )}
            </div>
          </div>
        )}

        {/* Quick links */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Link href="/invoices" className="bg-card border border-border rounded-2xl p-4 hover:bg-muted transition-colors">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Receipt size={14} />
              <span className="uppercase tracking-wider font-semibold">Invoices</span>
            </div>
            <div className="flex items-center justify-between mt-3">
              <span className="text-sm font-semibold text-foreground">View invoices</span>
              <ChevronRight size={15} className="text-muted-foreground" />
            </div>
          </Link>
          <Link href="/cashflow" className="bg-card border border-border rounded-2xl p-4 hover:bg-muted transition-colors">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Banknote size={14} />
              <span className="uppercase tracking-wider font-semibold">Cashflow</span>
            </div>
            <div className="flex items-center justify-between mt-3">
              <span className="text-sm font-semibold text-foreground">Understand business finances</span>
              <ChevronRight size={15} className="text-muted-foreground" />
            </div>
          </Link>
          <Link href="/parties" className="bg-card border border-border rounded-2xl p-4 hover:bg-muted transition-colors">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Users size={14} />
              <span className="uppercase tracking-wider font-semibold">Customers</span>
            </div>
            <div className="flex items-center justify-between mt-3">
              <span className="text-sm font-semibold text-foreground">Manage customers</span>
              <ChevronRight size={15} className="text-muted-foreground" />
            </div>
          </Link>
        </div>
      </div>
    </PageShell>
  )
}