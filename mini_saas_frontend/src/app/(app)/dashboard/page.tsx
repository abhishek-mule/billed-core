"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  AlertTriangle, RefreshCw, Phone, UserPlus,
  ChevronRight, ArrowRight, Banknote, Receipt, TrendingUp, Zap,
  X, Users, Target, Plus, Sparkles,
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
        <Skeleton className="h-7 w-40 rounded-lg" />
        <Skeleton className="h-44 rounded-3xl" />
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
        </div>
        <Skeleton className="h-36 rounded-2xl" />
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

const QUICK_ACTIONS = [
  { href: "/pos", label: "New Bill", desc: "Bill a customer", icon: Plus, highlight: true },
  { href: "/recovery", label: "Recovery", desc: "Work the queue", icon: Zap, highlight: false },
  { href: "/invoices", label: "Invoices", desc: "All invoices", icon: Receipt, highlight: false },
  { href: "/parties", label: "Customers", desc: "Manage parties", icon: Users, highlight: false },
]

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

  const todayLabel = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "short",
  })

  const exceptionRows = [
    exceptions.missingPhone > 0 && {
      icon: UserPlus,
      text: `${exceptions.missingPhone} customer${exceptions.missingPhone > 1 ? "s" : ""} missing phone number`,
    },
    exceptions.brokenPromises > 0 && {
      icon: X,
      text: `${exceptions.brokenPromises} payment promise${exceptions.brokenPromises > 1 ? "s" : ""} broken`,
    },
    exceptions.failedReminders > 0 && {
      icon: Phone,
      text: `${exceptions.failedReminders} reminder${exceptions.failedReminders > 1 ? "s" : ""} failed to deliver`,
    },
    exceptions.paymentToReview > 0 && {
      icon: Target,
      text: `${exceptions.paymentToReview} possible payment${exceptions.paymentToReview > 1 ? "s" : ""} to review`,
    },
  ].filter(Boolean) as { icon: typeof Phone; text: string }[]

  const isFresh = financial.totalOutstanding === 0 && financial.recoveredThisMonth === 0 && recoveryFocus.customerCount === 0
  const clampedRate = Math.max(0, Math.min(100, Math.round(recoveryPerformance.rate)))

  return (
    <PageShell>
      <div className="space-y-5 pb-8">
        {/* ── Header ── */}
        <div className="animate-element flex items-start justify-between gap-3">
          <div>
            <p suppressHydrationWarning className="text-xs font-medium text-muted-foreground">{todayLabel}</p>
            <h1 suppressHydrationWarning className="text-2xl font-bold text-foreground tracking-tight mt-0.5">
              {greeting}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Here&apos;s how your money is doing
            </p>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <Link
              href="/recovery"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-full text-xs font-semibold bg-card hover:bg-muted transition-colors"
            >
              <Zap className={`h-3.5 w-3.5 ${autoEnabled ? "text-emerald-500" : "text-muted-foreground"}`} />
              {autoEnabled === null ? "..." : autoEnabled ? "Auto on" : "Auto off"}
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${autoEnabled ? "bg-emerald-500" : "bg-muted-foreground"}`} />
            </Link>
            <button
              onClick={load}
              aria-label="Refresh"
              className="inline-flex items-center justify-center h-8 w-8 border border-border rounded-full text-muted-foreground bg-card hover:bg-muted transition-colors"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* ── Hero: outstanding ── */}
        <section className="animate-element animate-delay-100 relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/[0.14] via-card to-card p-5 sm:p-6">
          <div className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full bg-primary/10 blur-2xl" />
          <div className="relative">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="grid h-7 w-7 place-items-center rounded-xl bg-primary/10 text-primary">
                <Banknote size={15} />
              </span>
              <span className="uppercase tracking-wider font-semibold">Total outstanding</span>
            </div>
            <p className="mt-2 text-4xl font-bold tabular-nums tracking-tight text-foreground">
              {formatINR(financial.totalOutstanding)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatINR(financial.inRecovery)} in active recovery
              {recoveryFocus.customerCount > 0 && (
                <> · {recoveryFocus.customerCount} customer{recoveryFocus.customerCount !== 1 ? "s" : ""} need action</>
              )}
            </p>
            {sections.needsYou > 0 ? (
              <Link
                href="/recovery"
                className="mt-4 inline-flex w-full sm:w-auto items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors shadow-sm"
              >
                <Sparkles size={15} />
                {sections.needsYou} need{sections.needsYou === 1 ? "s" : ""} you — take action
                <ArrowRight size={15} />
              </Link>
            ) : (
              <Link
                href="/recovery"
                className="mt-4 inline-flex w-full sm:w-auto items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-border bg-card text-sm font-semibold text-foreground hover:bg-muted transition-colors"
              >
                Open Recovery Center <ArrowRight size={15} />
              </Link>
            )}
          </div>
        </section>

        {/* ── Supporting stats ── */}
        <div className="animate-element animate-delay-200 grid grid-cols-2 gap-3">
          <div className="bg-card border border-border rounded-2xl p-4">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <TrendingUp size={13} className="text-success" />
              <span className="uppercase tracking-wider font-semibold">Recovered</span>
            </div>
            <p className="mt-1.5 text-xl font-bold tabular-nums tracking-tight text-success">
              {formatINR(financial.recoveredThisMonth)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">This month</p>
          </div>
          <div className="bg-card border border-border rounded-2xl p-4">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Target size={13} className="text-primary" />
              <span className="uppercase tracking-wider font-semibold">In focus</span>
            </div>
            <p className="mt-1.5 text-xl font-bold tabular-nums tracking-tight text-foreground">
              {formatINR(recoveryFocus.amount)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {recoveryFocus.customerCount} customer{recoveryFocus.customerCount !== 1 ? "s" : ""} to act on
            </p>
          </div>
        </div>

        {/* ── Getting started (fresh merchants) ── */}
        {isFresh && (
          <section className="animate-element animate-delay-200 rounded-2xl border border-dashed border-border bg-muted/40 p-5 text-center">
            <p className="text-sm font-semibold text-foreground">You&apos;re all caught up 🎉</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Create your first bill or import customers to start tracking money.
            </p>
            <div className="mt-3 flex items-center justify-center gap-2">
              <Link
                href="/pos"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors"
              >
                <Plus size={13} /> New Bill
              </Link>
              <Link
                href="/parties/import"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-border bg-card text-xs font-semibold hover:bg-muted transition-colors"
              >
                Import customers
              </Link>
            </div>
          </section>
        )}

        {/* ── Recovery performance ── */}
        {recoveryFocus.customerCount > 0 && (
          <section className="animate-element animate-delay-300 bg-card border border-border rounded-2xl p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Zap size={14} className="text-primary" />
                <span className="uppercase tracking-wider font-semibold">Recovery performance</span>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-success/10 text-success text-xs font-bold tabular-nums">
                {clampedRate}%
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-xl font-bold tabular-nums text-foreground">{formatINR(recoveryPerformance.recovered)}</span>
              <span className="text-xs text-muted-foreground">recovered this month</span>
            </div>
            <div className="mt-2 h-2.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all"
                style={{ width: `${clampedRate}%` }}
              />
            </div>
            <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground border-t border-border pt-3">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                {sections.needsYou} need you
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                {sections.automated} automated
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                {sections.monitoring} monitoring
              </span>
            </div>
          </section>
        )}

        {/* ── Needs attention ── */}
        {exceptionRows.length > 0 && (
          <section className="animate-element animate-delay-300 rounded-2xl border border-danger/25 bg-danger/[0.04] p-4">
            <div className="flex items-center gap-2 text-xs text-danger px-1 pb-2">
              <AlertTriangle size={14} />
              <span className="uppercase tracking-wider font-semibold">Needs your attention</span>
              <span className="ml-auto px-1.5 py-0.5 rounded-full bg-danger/10 text-[11px] font-bold tabular-nums">
                {exceptionRows.length}
              </span>
            </div>
            <div className="divide-y divide-danger/10">
              {exceptionRows.map(({ icon: Icon, text }) => (
                <Link
                  key={text}
                  href="/recovery"
                  className="flex items-center gap-3 px-1 py-2.5 text-sm text-foreground hover:text-danger transition-colors group"
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-danger/10 text-danger">
                    <Icon size={15} />
                  </span>
                  <span className="flex-1">{text}</span>
                  <ChevronRight size={15} className="text-muted-foreground group-hover:text-danger group-hover:translate-x-0.5 transition-all" />
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ── Quick actions ── */}
        <section className="animate-element animate-delay-400">
          <p className="px-1 pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Quick actions
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {QUICK_ACTIONS.map(({ href, label, desc, icon: Icon, highlight }) => (
              <Link
                key={href}
                href={href}
                className={
                  highlight
                    ? "rounded-2xl bg-primary text-primary-foreground p-4 hover:bg-primary/90 transition-colors shadow-sm active:scale-[0.98]"
                    : "rounded-2xl bg-card border border-border p-4 hover:bg-muted hover:border-primary/30 transition-all active:scale-[0.98]"
                }
              >
                <span className={
                  highlight
                    ? "grid h-9 w-9 place-items-center rounded-xl bg-white/20"
                    : "grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary"
                }>
                  <Icon size={17} />
                </span>
                <p className="mt-2.5 text-sm font-semibold">{label}</p>
                <p className={highlight ? "text-[11px] text-primary-foreground/75" : "text-[11px] text-muted-foreground"}>{desc}</p>
              </Link>
            ))}
          </div>
        </section>

        {/* ── Secondary links ── */}
        <div className="animate-element animate-delay-500 flex items-center justify-center gap-4 text-xs text-muted-foreground pt-1">
          <Link href="/cashflow" className="hover:text-foreground transition-colors">Cashflow</Link>
          <span aria-hidden="true">·</span>
          <Link href="/pulse" className="hover:text-foreground transition-colors">Pulse</Link>
          <span aria-hidden="true">·</span>
          <Link href="/reports" className="hover:text-foreground transition-colors">Reports</Link>
        </div>
      </div>
    </PageShell>
  )
}
