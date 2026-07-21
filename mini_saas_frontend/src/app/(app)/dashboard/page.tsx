"use client"

import { useEffect, useState } from "react"
import { formatINR } from "@/lib/utils"
import { PageShell } from "@/components/billzo/PageShell"
import { Button } from "@/components/billzo/Button"
import Link from "next/link"
import {
  Shield, Clock, Users, TrendingUp, CreditCard, ArrowUpRight,
  ArrowDownRight, AlertTriangle, CheckCircle2, ExternalLink,
  Zap, Target, BarChart2, Activity, IndianRupee, Phone,
  CalendarClock, RefreshCw, Wifi, CheckCircle, CircleDashed,
  AlertCircle, CircleSlash, MessageCircle, Coins,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { AnyDashboardSection } from "@billzo/shared"
import { workStore } from "@/lib/billzo/work-store-instance"
import { getCollectionRisk } from "@/lib/billzo/recovery-risk"

interface RecoveryMetric {
  label: string
  value: string
  icon: React.ElementType
  color: string
  softColor: string
  trend?: { value: string; positive: boolean }
}

interface RecoveryAction {
  type: 'whatsapp' | 'call' | 'promise' | 'payment'
  label: string
  customer: string
  amount: string
  time: string
  icon: React.ElementType
  color: string
}

interface RecoveryFunnelStep {
  label: string
  value: string
  percentage: number
  color: string
  icon: React.ElementType
}

interface HealthScore {
  score: number
  label: string
  color: string
  metrics: {
    label: string
    value: string
  }[]
}

interface RecoveryEvent {
  time: string
  type: 'sent' | 'delivered' | 'read' | 'promise' | 'payment' | 'reminder' | 'scheduled'
  customer: string
  message: string
  amount?: string
  status: 'completed' | 'pending' | 'failed'
}

interface AttentionCustomer {
  id: string
  name: string
  amount: number
  ageDays: number
  status: string
  severity: 'critical' | 'high' | 'normal' | 'low'
  badges: string[]
  callHref?: string
  openHref: string
}

interface QueueSummary {
  scheduled: number
  waiting: number
  overdue: number
}

interface UpcomingAction {
  id: string
  time: string
  when: string
  type: string
  customer: string
  amount?: string
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  if (diff < 60000) return "just now"
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
}

function formatClock(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true })
}

function getSuccessLabel(score: number | null): string {
  if (score == null) return "—"
  if (score >= 85) return "Excellent"
  if (score >= 70) return "Good"
  if (score >= 50) return "Fair"
  return "Needs attention"
}

function getHealthColor(score: number) {
  if (score >= 80) return "text-recovery"
  if (score >= 60) return "text-outstanding"
  return "text-overdue"
}

function getHealthSoftColor(score: number) {
  if (score >= 80) return "bg-recovery-soft"
  if (score >= 60) return "bg-outstanding-soft"
  return "bg-overdue-soft"
}

// ─── Metric card ──────────────────────────────────────────────────────────────

function MetricCard({ label, value, icon: Icon, color, softColor, trend }: RecoveryMetric) {
  return (
    <div className="bg-card border border-border rounded-2xl shadow-sm p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl lg:text-3xl font-bold tabular-nums tracking-tight text-foreground">{value}</p>
          {trend && (
            <p className={cn("mt-1 flex items-center gap-1 text-xs font-medium", trend.positive ? "text-recovery" : "text-overdue")}>
              <ArrowUpRight size={10} className={cn(trend.positive ? "rotate-0" : "rotate-180")} />
              <span>{trend.value}</span>
            </p>
          )}
        </div>
        <div className={cn("flex h-12 w-12 items-center justify-center rounded-xl", softColor)}>
          <Icon size={22} className={color} />
        </div>
      </div>
    </div>
  )
}

// ─── Customers requiring attention ────────────────────────────────────────────

const SEVERITY_DOT: Record<AttentionCustomer['severity'], string> = {
  critical: "bg-overdue",
  high: "bg-outstanding",
  normal: "bg-recovery",
  low: "bg-muted-foreground/40",
}

const SEVERITY_RING: Record<AttentionCustomer['severity'], string> = {
  critical: "border-l-overdue",
  high: "border-l-outstanding",
  normal: "border-l-recovery",
  low: "border-l-muted-foreground/30",
}

function AttentionCustomerRow({ c }: { c: AttentionCustomer }) {
  return (
    <div className={cn("flex items-center gap-3 p-3 bg-card border border-border border-l-4 rounded-lg hover:bg-muted/40 transition-colors", SEVERITY_RING[c.severity])}>
      <span className={cn("flex-shrink-0 h-2.5 w-2.5 rounded-full", SEVERITY_DOT[c.severity])} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-foreground truncate">{c.name}</p>
          {c.badges.map(b => (
            <span key={b} className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
              {b}
            </span>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          <span className="font-semibold text-foreground tabular-nums">{formatINR(c.amount)}</span>
          {" • "}
          <span className={c.ageDays >= 15 ? "text-overdue font-medium" : ""}>{c.ageDays} days overdue</span>
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">{c.status}</p>
      </div>
      <div className="flex flex-col sm:flex-row gap-2 flex-shrink-0">
        {c.callHref && (
          <a href={c.callHref} className="inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg bg-muted text-foreground text-xs font-semibold hover:bg-muted/70">
            <Phone size={13} /> Call
          </a>
        )}
        <Link href={c.openHref} className="inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90">
          Open
        </Link>
      </div>
    </div>
  )
}

function CustomersAttentionCard({ customers, title }: { customers: AttentionCustomer[]; title: string }) {
  return (
    <div className="bg-card border border-border rounded-2xl shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-overdue-soft text-overdue">
            <AlertTriangle size={15} />
          </span>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {customers.length > 0 && (
            <span className="text-xs font-bold text-overdue bg-overdue-soft px-2 py-0.5 rounded-full">{customers.length}</span>
          )}
        </div>
        <Link href="/recovery/queue" className="text-xs font-semibold text-primary hover:underline flex items-center gap-1">
          View all <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
      <div className="space-y-2">
        {customers.length > 0 ? (
          customers.map(c => <AttentionCustomerRow key={c.id} c={c} />)
        ) : (
          <div className="text-center py-8">
            <CheckCircle2 className="h-10 w-10 text-recovery mx-auto mb-2" />
            <p className="text-sm font-medium text-foreground">No customers need attention right now.</p>
            <p className="text-xs text-muted-foreground mt-1">BillZo is handling follow-ups automatically.</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Today's Queue ────────────────────────────────────────────────────────────

function TodayQueueCard({ queue, title }: { queue: QueueSummary; title: string }) {
  return (
    <div className="bg-card border border-border rounded-2xl shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <CalendarClock size={15} />
          </span>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        </div>
        <Link href="/recovery/queue" className="text-xs font-semibold text-primary hover:underline flex items-center gap-1">
          View Queue <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 bg-muted/50 rounded-lg text-center">
          <p className="text-2xl font-bold text-foreground tabular-nums">{queue.scheduled}</p>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mt-0.5">Scheduled</p>
        </div>
        <div className="p-3 bg-muted/50 rounded-lg text-center">
          <p className="text-2xl font-bold text-foreground tabular-nums">{queue.waiting}</p>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mt-0.5">Waiting</p>
        </div>
        <div className="p-3 bg-muted/50 rounded-lg text-center">
          <p className="text-2xl font-bold text-overdue tabular-nums">{queue.overdue}</p>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mt-0.5">Overdue</p>
        </div>
      </div>
    </div>
  )
}

// ─── Live Recovery Activity ───────────────────────────────────────────────────

function eventVisual(type: RecoveryEvent['type']) {
  switch (type) {
    case 'sent':
    case 'reminder':
      return { icon: MessageCircle, color: 'text-primary', ring: 'bg-primary/10' }
    case 'delivered':
    case 'read':
      return { icon: CheckCircle, color: 'text-muted-foreground', ring: 'bg-muted' }
    case 'promise':
      return { icon: Target, color: 'text-outstanding', ring: 'bg-outstanding-soft' }
    case 'payment':
      return { icon: Coins, color: 'text-recovery', ring: 'bg-recovery-soft' }
    case 'scheduled':
      return { icon: CalendarClock, color: 'text-muted-foreground', ring: 'bg-muted' }
    default:
      return { icon: Activity, color: 'text-muted-foreground', ring: 'bg-muted' }
  }
}

function LiveActivityCard({ events, title }: { events: RecoveryEvent[]; title: string }) {
  return (
    <div className="bg-card border border-border rounded-2xl shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-recovery opacity-75 animate-ping" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-recovery" />
          </span>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        </div>
        <Link href="/recovery/history" className="text-xs font-semibold text-primary hover:underline flex items-center gap-1">
          Open Activity <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="space-y-1">
        {events.length > 0 ? (
          events.map((event, i) => {
            const v = eventVisual(event.type)
            const Icon = v.icon
            return (
              <div key={i} className="flex items-start gap-3 pb-3 last:pb-0">
                <div className="flex flex-col items-center flex-shrink-0">
                  <div className={cn("flex h-8 w-8 items-center justify-center rounded-full", v.ring)}>
                    <Icon size={15} className={v.color} />
                  </div>
                  {i < events.length - 1 && <div className="w-px flex-1 bg-border mt-1" />}
                </div>
                <div className="flex-1 min-w-0 pt-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-foreground truncate">{event.customer}</p>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap flex-shrink-0">{formatClock(event.time)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{event.message}</p>
                  <div className="flex items-center gap-2 mt-1">
                    {event.amount && <span className="text-xs font-bold text-recovery tabular-nums">{event.amount}</span>}
                    <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full",
                      event.status === 'completed' ? "bg-recovery-soft text-recovery" :
                      event.status === 'pending' ? "bg-outstanding-soft text-outstanding" :
                      "bg-overdue-soft text-overdue")}>
                      {event.status}
                    </span>
                  </div>
                </div>
              </div>
            )
          })
        ) : (
          <div className="text-center py-8">
            <CheckCircle2 className="h-10 w-10 text-recovery mx-auto mb-2" />
            <p className="text-sm font-medium text-foreground">All caught up!</p>
            <p className="text-xs text-muted-foreground mt-1">BillZo will notify you when there's new activity.</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Upcoming Scheduled Actions ───────────────────────────────────────────────

function UpcomingActionsCard({ actions, title }: { actions: UpcomingAction[]; title: string }) {
  return (
    <div className="bg-card border border-border rounded-2xl shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <CalendarClock size={15} />
          </span>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        </div>
        <Link href="/recovery/queue" className="text-xs font-semibold text-primary hover:underline flex items-center gap-1">
          View schedule <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
      <div className="space-y-2">
        {actions.length > 0 ? (
          actions.map(a => (
            <div key={a.id} className="flex items-center gap-3 p-2.5 bg-muted/40 rounded-lg">
              <div className="flex-shrink-0 text-right w-20">
                <p className="text-xs font-bold text-foreground tabular-nums">{a.time}</p>
                <p className="text-[10px] text-muted-foreground">{a.when}</p>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{a.type}</p>
                <p className="text-xs text-muted-foreground truncate">{a.customer}{a.amount ? ` · ${a.amount}` : ""}</p>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-6">
            <CircleDashed className="h-9 w-9 text-muted-foreground/50 mx-auto mb-2" />
            <p className="text-sm font-medium text-foreground">No scheduled actions.</p>
            <p className="text-xs text-muted-foreground mt-1">BillZo will schedule follow-ups automatically.</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Automation Status ───────────────────────────────────────────────────────

function AutomationStatusCard({ title }: { title: string }) {
  const items = [
    { icon: CalendarClock, label: "Scheduler running", ok: true },
    { icon: MessageCircle, label: "WhatsApp connected", ok: true },
    { icon: RefreshCw, label: "Last sync 2 min ago", ok: true },
  ]
  return (
    <div className="bg-card border border-border rounded-2xl shadow-sm p-5">
      <h3 className="text-sm font-semibold text-foreground mb-4">{title}</h3>
      <div className="space-y-2.5">
        {items.map(it => {
          const Icon = it.icon
          return (
            <div key={it.label} className="flex items-center gap-2.5">
              <Icon size={15} className="text-muted-foreground" />
              <span className="text-sm text-foreground flex-1">{it.label}</span>
              <CheckCircle size={16} className="text-recovery" />
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Recovery Funnel ─────────────────────────────────────────────────────────

function FunnelWidget({ steps, title }: { steps: RecoveryFunnelStep[]; title: string }) {
  return (
    <div className="bg-card border border-border rounded-2xl shadow-sm p-5">
      <h3 className="text-sm font-semibold text-foreground mb-4">{title}</h3>
      <div className="space-y-4">
        {steps.map((step, i) => (
          <div key={step.label} className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: `hsl(${step.color} / 0.12)`, color: `hsl(${step.color})` }}>
              <step.icon size={14} />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-foreground">{step.label}</span>
                <span className="font-bold tabular-nums text-foreground">{step.value}</span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-1.5">
                <div
                  className="h-full rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${step.percentage}%`, backgroundColor: `hsl(${step.color})` }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Cashflow Health ─────────────────────────────────────────────────────────

function HealthScoreWidget({ health }: { health: HealthScore }) {
  const scorePercent = Math.min(100, Math.max(0, health.score))
  return (
    <div className="bg-card border border-border rounded-2xl shadow-sm p-5">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-2">Cashflow Health</h3>
          <p className="text-xs text-muted-foreground">{health.label}</p>
        </div>
        <div className="relative" style={{ width: 80, height: 80 }}>
          <svg viewBox="0 0 80 80">
            <circle cx="40" cy="40" r="32" stroke="#e5e7eb" strokeWidth="6" fill="none" className="dark:stroke-white/10" />
            <circle
              cx="40" cy="40" r="32"
              stroke={health.color}
              strokeWidth="6" fill="none"
              strokeDasharray={201}
              strokeDashoffset={201 - (201 * scorePercent) / 100}
              strokeLinecap="round"
              className="transform -rotate-90 transition-all duration-1000 ease-out"
              style={{ transformOrigin: "40px 40px" }}
            />
            <text x="40" y="44" textAnchor="middle" dominantBaseline="middle" fontSize="16" fontWeight="700" fill="currentColor">
              {scorePercent}%
            </text>
          </svg>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3">
        {health.metrics.map((m) => (
          <div key={m.label} className="p-3 bg-muted/50 rounded-lg">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{m.label}</p>
            <p className="text-lg font-bold text-foreground tabular-nums mt-0.5">{m.value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Hero Card ───────────────────────────────────────────────────────────────

function HeroCard({
  outstanding,
  customers,
  successRate,
  recoveredByBillzo,
  oneLiner,
  isEmpty,
  nextAction,
}: {
  outstanding: number
  customers: number
  successRate: number | null
  recoveredByBillzo: number
  oneLiner: string
  isEmpty: boolean
  nextAction?: { stage: string; recommendation: string }
}) {
  return (
    <div className="relative overflow-hidden bg-gradient-to-br from-recovery/95 via-recovery/90 to-recovery/85 rounded-2xl p-5 lg:p-7 shadow-xl text-white">
      <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent" />
      <div className="absolute top-4 right-4 opacity-10">
        <Shield className="h-16 w-16" />
      </div>

      <div className="relative z-10">
        <div className="flex items-center gap-2 text-recovery-soft/90 text-xs font-semibold uppercase tracking-wider mb-3">
          <Zap className="h-4 w-4" />
          <span>Recovery Engine Active</span>
        </div>

        {isEmpty ? (
          <div className="mb-4">
            <p className="text-2xl lg:text-3xl font-bold tracking-tight">No outstanding invoices.</p>
            <p className="text-recovery-soft/85 text-sm mt-1.5 max-w-xl">
              BillZo will continue monitoring future invoices automatically.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div>
              <p className="text-recovery-soft/80 text-xs font-semibold uppercase tracking-wider">Awaiting Collection</p>
              <p className="text-4xl lg:text-5xl font-bold tracking-tight tabular-nums leading-tight">
                {formatINR(outstanding)}
              </p>
              <p className="text-recovery-soft/70 text-xs mt-0.5">{customers} customers</p>
            </div>
            <div>
              <p className="text-recovery-soft/80 text-xs font-semibold uppercase tracking-wider">Collection Success</p>
              <p className="text-3xl lg:text-4xl font-bold tracking-tight">{successRate == null ? '—' : `${successRate}%`}</p>
              <p className="text-recovery-soft/70 text-xs mt-0.5">{getSuccessLabel(successRate)}</p>
            </div>
            <div>
              <p className="text-recovery-soft/80 text-xs font-semibold uppercase tracking-wider">Next Action</p>
              {nextAction ? (
                <>
                  <p className="text-lg font-bold tracking-tight">{nextAction.stage}</p>
                  <p className="text-recovery-soft/70 text-xs mt-0.5">{nextAction.recommendation}</p>
                </>
              ) : (
                <>
                  <p className="text-lg font-bold tracking-tight">Auto</p>
                  <p className="text-recovery-soft/70 text-xs mt-0.5">Scheduled</p>
                </>
              )}
            </div>
            <div>
              <p className="text-recovery-soft/80 text-xs font-semibold uppercase tracking-wider">Recovered by BillZo</p>
              <p className="text-2xl lg:text-3xl font-bold tracking-tight tabular-nums">{formatINR(recoveredByBillzo)}</p>
              <p className="text-recovery-soft/70 text-xs mt-0.5">This month</p>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-white/10">
          <p className="text-sm text-white/95 font-medium flex-1 min-w-[220px]">{oneLiner}</p>
          <Link href="/recovery/queue" className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white text-recovery font-semibold text-xs hover:bg-white/90 transition-colors">
            View Recovery Center <ArrowUpRight size={14} className="rotate-45" />
          </Link>
        </div>
      </div>
    </div>
  )
}

// ─── States ──────────────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <PageShell title="Recovery Command Center" subtitle="Welcome back">
      <div className="space-y-5 animate-pulse">
        <div className="h-32 bg-gradient-to-br from-recovery/95 via-recovery/90 to-recovery/85 rounded-2xl" />
        <div className="h-48 bg-muted rounded-xl" />
        <div className="grid gap-4 sm:grid-cols-2"><div className="h-32 bg-muted rounded-xl" /><div className="h-32 bg-muted rounded-xl" /></div>
        <div className="h-64 bg-muted rounded-xl" />
      </div>
    </PageShell>
  )
}

function ErrorState() {
  return (
    <PageShell title="Recovery Command Center" subtitle="Welcome back">
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

function EmptyRecoveryState() {
  return (
    <PageShell title="Recovery Command Center" subtitle="Welcome back">
      <div className="space-y-5">
        <HeroCard outstanding={0} customers={0} successRate={null} recoveredByBillzo={0} isEmpty oneLiner="No customers require manual follow-up." />
        <CustomersAttentionCard title="Customers Requiring Attention" customers={[]} />
        <TodayQueueCard title="Today's Queue" queue={{ scheduled: 0, waiting: 0, overdue: 0 }} />
        <LiveActivityCard title="Live Recovery Activity" events={[]} />
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2"><FunnelWidget title="Recovery Funnel" steps={[]} /></div>
          <HealthScoreWidget health={{ score: 0, label: "Good", color: "hsl(var(--recovery))", metrics: [] }} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <MetricCard label="Recovered This Month" value={formatINR(0)} icon={TrendingUp} color="text-recovery" softColor="bg-recovery-soft" />
          <MetricCard label="Collection Success Rate" value="100%" icon={Target} color="text-primary" softColor="bg-primary/10" />
          <MetricCard label="Avg Collection Time" value="—" icon={Clock} color="text-outstanding" softColor="bg-outstanding-soft" />
        </div>
      </div>
    </PageShell>
  )
}

// ─── Main ────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [data, setData] = useState<{
    sections: AnyDashboardSection[]
    recovery?: {
      outstanding: number
      customers: number
      successRate: number | null
      recoveredByBillzo: number
      oneLiner: string
      isEmpty: boolean
      attention: AttentionCustomer[]
      queue: QueueSummary
      activity: RecoveryEvent[]
      upcoming: UpcomingAction[]
      funnel: RecoveryFunnelStep[]
      health: HealthScore
    }
  } | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    workStore.getDashboard()
      .then(result => {
        const sections = result.sections
        const recovery = extractRecoveryData(sections)
        setData({ sections, recovery })
      })
      .catch(err => {
        console.error('[Dashboard] workStore.getDashboard() failed:', err)
        setError(true)
      })
  }, [])

  if (error) return <ErrorState />
  if (!data) return <LoadingSkeleton />
  if (!data.recovery) return <EmptyRecoveryState />

  const { recovery } = data

  // Worst-case CollectionRisk across customers requiring attention drives the
  // hero's recommended next action.
  const nextAction = recovery.attention?.length
    ? recovery.attention
        .map(a => getCollectionRisk({ overdueDays: a.ageDays, outstanding: true }))
        .sort((x, y) => y.rank - x.rank)[0]
    : undefined

  return (
    <PageShell title="Recovery Command Center" subtitle="Welcome back">
      <HeroCard
        outstanding={recovery.outstanding}
        customers={recovery.customers}
        successRate={recovery.successRate}
        recoveredByBillzo={recovery.recoveredByBillzo}
        oneLiner={recovery.oneLiner}
        isEmpty={recovery.isEmpty}
        nextAction={nextAction ? { stage: nextAction.label, recommendation: nextAction.recommendation } : undefined}
      />

      <CustomersAttentionCard title="Customers Requiring Attention" customers={recovery.attention} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <TodayQueueCard title="Today's Queue" queue={recovery.queue} />
        </div>
        <div className="lg:col-span-2">
          <UpcomingActionsCard title="Upcoming Scheduled Actions" actions={recovery.upcoming} />
        </div>
      </div>

      <LiveActivityCard title="Live Recovery Activity" events={recovery.activity} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <FunnelWidget title="Recovery Funnel" steps={recovery.funnel} />
        </div>
        <div className="space-y-4">
          <HealthScoreWidget health={recovery.health} />
          <AutomationStatusCard title="Automation Status" />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard
          label="Recovered Today"
          value={formatINR(recovery.recoveredByBillzo)}
          icon={TrendingUp}
          color="text-recovery"
          softColor="bg-recovery-soft"
        />
        <MetricCard
          label="Collection Rate"
          value={recovery.successRate == null ? '—' : `${recovery.successRate}%`}
          icon={Target}
          color="text-primary"
          softColor="bg-primary/10"
        />
        <MetricCard
          label="Outstanding Amount"
          value={formatINR(recovery.outstanding)}
          icon={Clock}
          color="text-outstanding"
          softColor="bg-outstanding-soft"
        />
      </div>
    </PageShell>
  )
}

// ─── Data extraction ─────────────────────────────────────────────────────────

function extractRecoveryData(sections: AnyDashboardSection[]) {
  const todaySection = sections.find(s => s.type === 'today') as AnyDashboardSection & {
    type: 'today'
    payload: {
      items: {
        id: string
        customerId: string
        customerName: string
        headline: string
        reason: string
        severity: 'critical' | 'high' | 'normal' | 'low'
        primaryAction?: { type: string; target?: { id: string } }
        moneyImpact: number
        dueAt?: string
      }[]
      empty?: any
    }
  }
  const cashSection = sections.find(s => s.type === 'cash') as AnyDashboardSection & {
    type: 'cash'
    payload: { metrics: { label: string; value: string }[] }
  }
  const activitySection = sections.find(s => s.type === 'activity') as AnyDashboardSection & {
    type: 'activity'
    payload: { events: { occurredAt: string; label: string; detail: string }[] }
  }

  const outstanding = cashSection?.payload?.metrics?.find(m => m.label === 'Outstanding')?.value
    ? parseFloat(cashSection.payload.metrics.find(m => m.label === 'Outstanding')?.value?.replace(/[₹,]/g, '') || '0')
    : 0

  const recoveredByBillzo = cashSection?.payload?.metrics?.find(m => m.label === 'Collected Today')?.value
    ? parseFloat(cashSection.payload.metrics.find(m => m.label === 'Collected Today')?.value?.replace(/[₹,]/g, '') || '0')
    : 0

  const totalMonitored = outstanding + recoveredByBillzo
  const successRate = totalMonitored > 0 ? Math.round((recoveredByBillzo / totalMonitored) * 100) : null

  const workItems = todaySection?.payload?.items || []
  const isEmpty = outstanding === 0 && workItems.length === 0

  // Customers requiring attention (real WorkItems)
  const attention: AttentionCustomer[] = workItems.slice(0, 6).map(item => {
    const ageDays = item.dueAt ? Math.max(0, Math.floor((Date.now() - new Date(item.dueAt).getTime()) / 86400000)) : 0
    const badges: string[] = []
    if (item.severity === 'critical') badges.push('VIP')
    return {
      id: item.id || item.customerId,
      name: item.customerName,
      amount: item.moneyImpact || 0,
      ageDays,
      status: item.reason || item.headline,
      severity: item.severity,
      badges,
      callHref: item.primaryAction?.type === 'call' ? `tel:` : undefined,
      openHref: `/recovery/queue?customer=${encodeURIComponent(item.customerId)}`,
    }
  })

  // Today's Queue counts (scheduler-aligned)
  const queue: QueueSummary = {
    scheduled: workItems.filter(i => ['send_reminder', 'reminder', 'review'].includes(i.primaryAction?.type || '')).length,
    waiting: workItems.filter(i => i.primaryAction?.type === 'wait').length,
    overdue: workItems.filter(i => i.severity === 'critical' || i.severity === 'high').length,
  }

  // Live Recovery Activity (real events only; empty array shows clean empty state when no events exist)
  const rawEvents = activitySection?.payload?.events || []
  const activity: RecoveryEvent[] = rawEvents.slice(0, 8).map(e => {
    const label = (e.label || '').toLowerCase()
    let type: RecoveryEvent['type'] = 'reminder'
    if (label.includes('promise')) type = 'promise'
    else if (label.includes('payment') || label.includes('collected')) type = 'payment'
    else if (label.includes('delivered')) type = 'delivered'
    else if (label.includes('read')) type = 'read'
    else if (label.includes('scheduled')) type = 'scheduled'
    else type = 'sent'
    const [customer, amount] = e.detail?.includes('—') ? e.detail.split('—').map(s => s.trim()) : [e.detail, undefined]
    return {
      time: e.occurredAt,
      type,
      customer: customer || 'BillZo',
      message: e.label,
      amount,
      status: type === 'payment' || type === 'delivered' || type === 'promise' ? 'completed' : 'pending',
    }
  })

  // Upcoming scheduled actions derived dynamically from actual workItems
  const upcoming: UpcomingAction[] = workItems
    .filter(item => item.dueAt || item.primaryAction)
    .slice(0, 5)
    .map((item, i) => {
      const d = item.dueAt ? new Date(item.dueAt) : new Date()
      return {
        id: item.id || `u-${i}`,
        time: d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }),
        when: d.toDateString() === new Date().toDateString() ? 'Today' : 'Tomorrow',
        type: item.headline || 'Payment Follow-up',
        customer: item.customerName,
        amount: item.moneyImpact ? formatINR(item.moneyImpact) : undefined,
      }
    })

  // Real Funnel counts
  const reminderCount = workItems.filter(i => ['send_reminder', 'reminder', 'review'].includes(i.primaryAction?.type || '')).length
  const promiseCount = workItems.filter(i => (i.reason || '').toLowerCase().includes('promise')).length
  const funnel: RecoveryFunnelStep[] = [
    { label: 'Awaiting Collection', value: formatINR(outstanding), percentage: 100, color: '220 15% 55%', icon: IndianRupee },
    { label: 'Reminder Scheduled', value: String(reminderCount), percentage: workItems.length ? Math.round((reminderCount / workItems.length) * 100) : 0, color: '180 85% 35%', icon: MessageCircle },
    { label: 'Promise Recorded', value: String(promiseCount), percentage: workItems.length ? Math.round((promiseCount / workItems.length) * 100) : 0, color: '38 92% 50%', icon: Target },
    { label: 'Recovered Today', value: formatINR(recoveredByBillzo), percentage: totalMonitored > 0 ? Math.round((recoveredByBillzo / totalMonitored) * 100) : 0, color: '145 85% 35%', icon: Coins },
  ]

  const criticalOverdue = workItems.filter(i => i.severity === 'critical' || i.severity === 'high').length
  const totalCount = Math.max(1, workItems.length)
  const healthScoreNum = Math.max(0, Math.min(100, Math.round(100 - (criticalOverdue / totalCount) * 40)))

  const health: HealthScore = {
    score: healthScoreNum,
    label: getSuccessLabel(healthScoreNum),
    color: getHealthColor(healthScoreNum),
    metrics: [
      { label: "Active Items", value: `${workItems.length}` },
      { label: "Critical Overdue", value: `${criticalOverdue}` },
       { label: "Collection Rate", value: `${successRate == null ? '—' : `${successRate}%`}` },
    ],
  }

  // Hero one-liner (true status)
  const invoiceCount = Math.max(customersFromItems(workItems), outstanding > 0 ? 1 : 0)
  const oneLiner = isEmpty
    ? "No customers require manual follow-up."
    : `BillZo is monitoring ${invoiceCount} invoice${invoiceCount === 1 ? '' : 's'}. Automated recovery active.`

  return {
    outstanding,
    customers: workItems.length,
    successRate,
    recoveredByBillzo,
    oneLiner,
    isEmpty,
    attention,
    queue,
    activity,
    upcoming,
    funnel,
    health,
  }
}


function customersFromItems(items: { customerId: string }[]): number {
  return new Set(items.map(i => i.customerId)).size
}
