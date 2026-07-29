"use client"

import { useEffect, useState } from "react"
import { formatINR } from "@/lib/utils"
import { PageShell } from "@/components/billzo/PageShell"
import Link from "next/link"
import {
  Phone, MessageSquare, ArrowUpRight,
  AlertTriangle, CheckCircle2, ExternalLink,
  Target, CalendarClock,
  MessageCircle, RefreshCw, CircleDashed,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { formatScheduledSlot } from "@/lib/recovery/business-hours"

type ActionItem = {
  caseId: string
  customerId: string
  customerName: string
  phone: string | null
  amount: number
  recoverableAmount: number
  overdue: number
  actionType: string
  state: string
  reasons: { type: string; impact: string }[]
}

type AttentionItem = ActionItem & {
  invoiceCount: number
  severity: 'critical' | 'high' | 'normal'
  badges: string[]
}

type ScheduledItem = {
  id: string
  actionType: string
  customerName: string
  scheduledAt: string
  amount?: string
}

type HealthDriver = {
  title: string
  status: 'good' | 'warning' | 'critical'
  impact: 'high' | 'medium' | 'low'
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
  attention: AttentionItem[]
  upcoming: ScheduledItem[]
  health: {
    score: number
    drivers: HealthDriver[]
  }
}

const fmt = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN')

function actionLabel(a: string) {
  return (
    { call: 'Call', send_reminder: 'Send Reminder', reminder: 'Reminder',
      record_payment: 'Record Payment', wait: 'Wait', visit: 'Visit',
      promise_followup: 'Promise Follow-up' } as any
  )[a] || a.replace(/_/g, ' ')
}

const SEVERITY_DOT: Record<string, string> = {
  critical: "bg-overdue",
  high: "bg-outstanding",
  normal: "bg-recovery",
}

function healthColor(score: number) {
  if (score >= 75) return 'text-recovery'
  if (score >= 45) return 'text-outstanding'
  return 'text-overdue'
}

function healthBg(score: number) {
  if (score >= 75) return 'bg-recovery-soft'
  if (score >= 45) return 'bg-outstanding-soft'
  return 'bg-overdue-soft'
}

function statusIcon(status: string) {
  if (status === 'good') return <CheckCircle2 size={14} className="text-recovery" />
  if (status === 'warning') return <AlertTriangle size={14} className="text-outstanding" />
  return <AlertTriangle size={14} className="text-overdue" />
}

/* ─── Loading ───────────────────────────────────────────────────────── */

function LoadingSkeleton() {
  return (
    <PageShell title="Overview" subtitle="Welcome back">
      <div className="space-y-5 animate-pulse">
        <div className="h-44 bg-gradient-to-br from-recovery/95 via-recovery/90 to-recovery/85 rounded-2xl" />
        <div className="h-48 bg-muted rounded-xl" />
        <div className="grid gap-4 sm:grid-cols-2"><div className="h-32 bg-muted rounded-xl" /><div className="h-32 bg-muted rounded-xl" /></div>
      </div>
    </PageShell>
  )
}

function ErrorState() {
  return (
    <PageShell title="Overview" subtitle="Welcome back">
      <div className="text-center py-12">
        <div className="mx-auto h-12 w-12 rounded-full bg-overdue-soft flex items-center justify-center">
          <AlertTriangle className="h-6 w-6 text-overdue" />
        </div>
        <p className="mt-4 text-foreground">Could not load your dashboard</p>
        <button onClick={() => window.location.reload()} className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90">
          Try again
        </button>
      </div>
    </PageShell>
  )
}

function EmptyState() {
  return (
    <PageShell title="Overview" subtitle="Welcome back">
      <div className="space-y-5">
        <div className="relative overflow-hidden bg-gradient-to-br from-recovery/95 via-recovery/90 to-recovery/85 rounded-2xl p-5 lg:p-7 shadow-xl text-white">
          <div className="relative z-10">
            <p className="text-2xl lg:text-3xl font-bold tracking-tight">No outstanding invoices.</p>
            <p className="text-recovery-soft/85 text-sm mt-1.5 max-w-xl">BillZo will continue monitoring future invoices automatically.</p>
          </div>
        </div>
        <div className="bg-card border border-border rounded-2xl shadow-sm p-5">
          <div className="flex items-center gap-2">
            <RefreshCw size={15} className="text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Automation Status</h3>
          </div>
          <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><CheckCircle2 size={12} className="text-recovery" /> Scheduler</span>
            <span className="flex items-center gap-1"><CheckCircle2 size={12} className="text-recovery" /> WhatsApp</span>
            <span className="flex items-center gap-1"><CheckCircle2 size={12} className="text-recovery" /> Last sync 2m ago</span>
          </div>
        </div>
      </div>
    </PageShell>
  )
}

/* ─── Main ──────────────────────────────────────────────────────────── */

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    fetch('/api/recovery/workspace', { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(setData)
      .catch(() => setError(true))
  }, [])

  if (error) return <ErrorState />
  if (!data) return <LoadingSkeleton />
  if (data.hero.outstanding === 0 && data.todayPlan.length === 0) return <EmptyState />

  const { hero, todayPlan, attention, upcoming, health } = data

  return (
    <PageShell title="Overview" subtitle="Welcome back">
      {/* ── Hero ── */}
      <div className="relative overflow-hidden bg-gradient-to-br from-recovery/95 via-recovery/90 to-recovery/85 rounded-2xl p-5 lg:p-7 shadow-xl text-white">
        <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent" />
        <div className="relative z-10 space-y-4">
          <div>
            <p className="text-recovery-soft/80 text-xs font-semibold uppercase tracking-wider">Awaiting Collection</p>
            <p className="text-4xl lg:text-5xl font-bold tracking-tight tabular-nums leading-tight">{fmt(hero.outstanding)}</p>
            <p className="text-recovery-soft/70 text-xs mt-0.5">{hero.customerCount} customers · {hero.invoiceCount} invoices</p>
          </div>

          {hero.bestOpportunity ? (
            <div className="bg-white/10 rounded-xl p-4">
              <p className="text-recovery-soft/80 text-xs font-semibold uppercase tracking-wider mb-2">Best Opportunity Today</p>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20">
                  {hero.bestOpportunity.actionType === 'call' ? <Phone size={18} /> : <MessageSquare size={18} />}
                </div>
                <div className="flex-1">
                  <p className="text-lg font-bold">{hero.bestOpportunity.customerName}</p>
                  <p className="text-recovery-soft/85 text-sm">{actionLabel(hero.bestOpportunity.actionType)} · {fmt(hero.bestOpportunity.amount)}</p>
                </div>
                <Link
                  href={`/recovery/case/${hero.bestOpportunity.caseId}`}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white text-recovery font-bold text-sm hover:bg-white/90 transition-colors"
                >
                  Start Recovery <ArrowUpRight size={14} />
                </Link>
              </div>
            </div>
          ) : null}

          <div className="flex items-center gap-3 pt-1 border-t border-white/10">
            <p className="text-sm text-white/95 font-medium">
              {todayPlan.length > 0
                ? `Start with ${todayPlan[0].customerName} — highest recovery opportunity today.`
                : `${fmt(hero.outstanding)} pending. Automated recovery active.`}
            </p>
          </div>
        </div>
      </div>

      {/* ── Today's Plan ── */}
      <div className="bg-card border border-border rounded-2xl shadow-sm p-5">
        <div className="flex items-center gap-2 mb-4">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-overdue-soft text-overdue">
            <Target size={15} />
          </span>
          <h3 className="text-sm font-semibold text-foreground">Today&apos;s Recovery Plan</h3>
          {todayPlan.length > 0 && (
            <span className="text-[10px] font-bold text-white bg-overdue px-2 py-0.5 rounded-full">{todayPlan.length}</span>
          )}
        </div>
        <div className="space-y-2">
          {todayPlan.length > 0 ? (
            todayPlan.slice(0, 5).map((item, i) => (
              <Link
                key={item.caseId}
                href={`/recovery/case/${item.caseId}`}
                className="flex items-center gap-3 p-3 bg-card border border-border border-l-4 rounded-lg hover:bg-muted/40 transition-colors"
                style={{ borderLeftColor: item.actionType === 'call' ? 'hsl(var(--destructive))' : item.actionType === 'record_payment' ? 'hsl(var(--success))' : 'hsl(var(--warning))' }}
              >
                <div className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                  {i + 1}
                </div>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
                  {item.actionType === 'call' ? <Phone size={15} className="text-muted-foreground" /> : <MessageCircle size={15} className="text-muted-foreground" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground truncate">{item.customerName}</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                      {actionLabel(item.actionType)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {item.overdue > 0 ? `${item.overdue} days overdue` : 'Due soon'}
                    {item.reasons.length > 0 ? ` · ${item.reasons.map(r => r.type.replace(/_/g, ' ')).join(', ')}` : ''}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-foreground tabular-nums">{fmt(item.recoverableAmount)}</p>
                </div>
              </Link>
            ))
          ) : (
            <div className="text-center py-6">
              <CheckCircle2 className="h-9 w-9 text-muted-foreground/50 mx-auto mb-2" />
              <p className="text-sm font-medium text-muted-foreground">No follow-ups needed right now.</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Lower Grid: Attention + Upcoming + Health ── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          {/* Customers Requiring Attention */}
          <div className="bg-card border border-border rounded-2xl shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-overdue-soft text-overdue">
                  <AlertTriangle size={15} />
                </span>
                <h3 className="text-sm font-semibold text-foreground">Needs Attention</h3>
                {attention.length > 0 && (
                  <span className="text-xs font-bold text-overdue bg-overdue-soft px-2 py-0.5 rounded-full">{attention.length}</span>
                )}
              </div>
              <Link href="/recovery" className="text-xs font-semibold text-primary hover:underline flex items-center gap-1">
                View all <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
            <div className="space-y-2">
              {attention.length > 0 ? (
                attention.slice(0, 4).map(c => (
                  <Link key={c.caseId} href={`/recovery/case/${c.caseId}`}
                    className="flex items-center gap-3 p-3 bg-card border border-border rounded-lg hover:bg-muted/40 transition-colors">
                    <span className={cn("flex-shrink-0 h-2.5 w-2.5 rounded-full", SEVERITY_DOT[c.severity])} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{c.customerName}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        <span className="font-semibold text-foreground tabular-nums">{fmt(c.amount)}</span>
                        {c.invoiceCount > 1 && <span> · {c.invoiceCount} invoices</span>}
                        {c.overdue > 0 && <span> · {c.overdue}d overdue</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {c.phone ? (
                        <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-muted text-foreground text-xs font-semibold hover:bg-muted/70" onClick={e => e.stopPropagation()}>
                          <Phone size={13} /> Call
                        </a>
                      ) : null}
                      <span className="text-xs font-semibold text-primary">Open →</span>
                    </div>
                  </Link>
                ))
              ) : (
                <div className="text-center py-8">
                  <CheckCircle2 className="h-10 w-10 text-recovery mx-auto mb-2" />
                  <p className="text-sm font-medium text-foreground">No customers need attention right now.</p>
                  <p className="text-xs text-muted-foreground mt-1">Recovery is on track.</p>
                </div>
              )}
            </div>
          </div>

          {/* Upcoming Schedule */}
          <div className="bg-card border border-border rounded-2xl shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <CalendarClock size={15} />
              </span>
              <h3 className="text-sm font-semibold text-foreground">Upcoming Schedule</h3>
            </div>
            <div className="space-y-2">
              {upcoming.length > 0 ? (
                upcoming.map(a => (
                  <div key={a.id} className="flex items-center gap-3 p-2.5 bg-muted/40 rounded-lg">
                    <div className="flex-shrink-0 text-right w-28">
                      <p className="text-[11px] font-semibold text-foreground tabular-nums">{formatScheduledSlot(a.scheduledAt)}</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{actionLabel(a.actionType)}</p>
                      <p className="text-xs text-muted-foreground truncate">{a.customerName}</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-6">
                  <CircleDashed className="h-9 w-9 text-muted-foreground/50 mx-auto mb-2" />
                  <p className="text-sm font-medium text-foreground">No upcoming actions.</p>
                  <p className="text-xs text-muted-foreground mt-1">BillZo will schedule follow-ups automatically.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Recovery Health */}
          <div className="bg-card border border-border rounded-2xl shadow-sm p-5">
            <h3 className="text-sm font-semibold text-foreground mb-3">Recovery Health</h3>
            <div className="flex items-center gap-3 mb-3">
              <span className={cn("text-2xl font-bold tabular-nums", healthColor(health.score))}>{health.score}</span>
              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all", healthBg(health.score))}
                  style={{ width: `${Math.min(100, Math.max(0, health.score))}%` }}
                />
              </div>
            </div>
            <div className="space-y-2">
              {health.drivers.map((d, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <span className="mt-0.5">{statusIcon(d.status)}</span>
                  <span className="text-muted-foreground">{d.title}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Automation */}
          <div className="bg-card border border-border rounded-2xl shadow-sm p-5">
            <h3 className="text-sm font-semibold text-foreground mb-3">Automation</h3>
            <div className="space-y-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={12} className="text-recovery" />
                <span>Scheduler running</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 size={12} className="text-recovery" />
                <span>WhatsApp connected</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 size={12} className="text-recovery" />
                <span>Last sync 2 min ago</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  )
}
