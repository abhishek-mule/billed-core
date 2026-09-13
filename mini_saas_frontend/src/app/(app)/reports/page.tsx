'use client'

import { useEffect, useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import {
  TrendingUp, Clock, FileText, Package,
  Plus, ChevronRight, ArrowUpRight, ArrowDownRight, Wallet,
  Phone, RefreshCw, CheckCircle2,
} from "lucide-react"
import { Button } from "@/components/billzo/Button"
import { db } from "@/lib/billzo/db"
import { formatINR } from "@/lib/utils"
import { getTenantId } from "@/lib/billzo/tenant"
import { useReportsData } from "@/components/reports/useReportsData"
import { DateRangePicker } from "@/components/reports/DateRangePicker"
import type {
  RecoveryMetrics, AgingBucket, GSTReport, SalesMetrics,
  PendingInvoice, PlanType, DateRange,
} from "@/lib/billzo/report-engine"

// ============================================================
// MetricCard — single KPI with label, value, optional trend/tag
// ============================================================

function MetricCard({ label, value, trend, tag }: {
  label: string
  value: string
  trend?: { direction: 'up' | 'down' | 'neutral'; value: string }
  tag?: { label: string; color: string }
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 lg:p-5">
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="mt-1.5 text-2xl lg:text-[28px] font-bold text-foreground tabular-nums leading-none tracking-tight">{value}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {trend && (
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            trend.direction === 'up' ? 'bg-success-soft text-success' :
            trend.direction === 'down' ? 'bg-danger-soft text-danger' :
            'bg-muted text-muted-foreground'
          }`}>
            {trend.direction === 'up' ? <ArrowUpRight className="w-3 h-3" /> :
             trend.direction === 'down' ? <ArrowDownRight className="w-3 h-3" /> : null}
            {trend.value}
          </span>
        )}
        {tag && (
          <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${tag.color}`}>{tag.label}</span>
        )}
      </div>
    </div>
  )
}

// ============================================================
// MetricGrid — KPI cluster
// ============================================================

function MetricGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 lg:gap-3">
      {children}
    </div>
  )
}

// ============================================================
// StatTile — compact metric used inside larger cards
// ============================================================

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/40 px-3 py-2.5">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="mt-0.5 text-base font-bold text-foreground tabular-nums">{value}</p>
    </div>
  )
}

// ============================================================
// ActionList — list of actionable items
// ============================================================

function ActionList({ items, renderItem, viewAll }: {
  items: any[]
  renderItem: (item: any, i: number) => React.ReactNode
  viewAll?: { label: string; href: string }
}) {
  if (items.length === 0) return null

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="divide-y divide-border/70">
        {items.slice(0, 5).map((item, i) => renderItem(item, i))}
      </div>
      {viewAll && items.length > 5 && (
        <div className="px-4 py-2.5 border-t border-border/70">
          <button
            onClick={() => window.location.href = viewAll.href}
            className="text-xs text-muted-foreground hover:text-foreground font-medium flex items-center gap-1"
          >
            {viewAll.label} ({items.length}) <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  )
}

// ============================================================
// SectionHeader
// ============================================================

function SectionHeader({ icon, title, subtitle }: {
  icon: React.ReactNode
  title: string
  subtitle?: string
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </span>
      <div className="min-w-0">
        <h2 className="text-sm font-bold text-foreground leading-tight">{title}</h2>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  )
}

// ============================================================
// Friendly period formatting (display only — compute stays on
// the app-wide YYYY-MM-DD convention shared by every report)
// ============================================================

function parseDatePart(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y || 0, (m || 1) - 1, d || 1, 12)
}

function formatFriendlyRange(start: string, end: string): string {
  const s = parseDatePart(start)
  const e = parseDatePart(end)
  const day = (d: Date) => d.getDate()
  const month = (d: Date) => d.toLocaleDateString('en-IN', { month: 'short' })
  if (start === end) return `${day(e)} ${month(e)} ${e.getFullYear()}`
  if (s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth()) {
    return `${day(s)}–${day(e)} ${month(e)} ${e.getFullYear()}`
  }
  if (s.getFullYear() === e.getFullYear()) {
    return `${day(s)} ${month(s)} – ${day(e)} ${month(e)} ${e.getFullYear()}`
  }
  return `${day(s)} ${month(s)} ${s.getFullYear()} – ${day(e)} ${month(e)} ${e.getFullYear()}`
}

// ============================================================
// Section wrapper
// ============================================================

function Section({ children }: { children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      {children}
    </section>
  )
}

// ============================================================
// EmptyState
// ============================================================

function EmptyState({ icon, text, action }: {
  icon: React.ReactNode
  text: string
  action?: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/50 px-6 py-10 text-center">
      <div className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-muted text-muted-foreground mb-3">
        {icon}
      </div>
      <p className="text-sm font-medium text-foreground">{text}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

// ============================================================
// SendReminderButton
// ============================================================

function SendReminderButton({ phone, customerName, amount }: {
  phone?: string
  customerName: string
  amount: number
}) {
  const [sent, setSent] = useState(false)
  const handleClick = async () => {
    try {
      const tenantId = getTenantId()
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          customerPhone: phone,
          templateKey: 'udharGentle',
          vars: { '1': customerName, '2': formatINR(amount) },
        }),
      })
      if (res.ok) { setSent(true); setTimeout(() => setSent(false), 2000) }
    } catch (err) { console.error('[Reports] Failed to send reminder:', err) }
  }

  return (
    <button
      onClick={handleClick}
      className={`shrink-0 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border transition-colors ${
        sent ? 'bg-success-soft text-success border-success/30' :
        'bg-muted/40 text-muted-foreground border-border hover:bg-muted hover:text-foreground'
      }`}
    >
      {sent ? 'Sent!' : 'Remind'}
    </button>
  )
}

// ============================================================
// ExpectedRecovery — timeline of expected cash inflow
// ============================================================

function ExpectedRecovery({ aging }: { aging: AgingBucket[] }) {
  const total = aging.reduce((s, b) => s + b.amount, 0)
  const bands = aging.map(b => ({
    label: b.label,
    amount: b.amount,
    pct: total > 0 ? (b.amount / total) * 100 : 0,
    color: b.color,
  }))

  return (
    <div className="rounded-2xl border border-border bg-card p-4 lg:p-5">
      <p className="text-xs font-semibold text-muted-foreground mb-4">Expected Recovery Timeline</p>
      <div className="h-3 bg-muted/60 rounded-full overflow-hidden flex">
        {bands.map((b, i) => (
          <div
            key={i}
            style={{ width: `${b.pct}%`, backgroundColor: b.color }}
            className={`h-full ${i === 0 ? '' : ''}`}
            title={`${b.label}: ${formatINR(b.amount)}`}
          />
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
        {bands.map((b, i) => (
          <div key={i} className="flex items-center gap-2 min-w-0">
            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: b.color }} />
            <div className="min-w-0">
              <p className="text-[11px] text-muted-foreground truncate">{b.label}</p>
              <p className="text-xs font-bold text-foreground tabular-nums">{formatINR(b.amount)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ============================================================
// AgingBucketsBar — horizontal stacked bar showing age
// ============================================================

function AgingBucketsBar({ buckets }: { buckets: AgingBucket[] }) {
  const total = buckets.reduce((s, b) => s + b.amount, 0)
  return (
    <div className="rounded-2xl border border-border bg-card p-4 lg:p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-semibold text-muted-foreground">Aging Buckets</p>
        <p className="text-xs font-semibold text-foreground tabular-nums">{formatINR(total)} outstanding</p>
      </div>
      <div className="space-y-3.5">
        {buckets.map((b, i) => {
          const pct = total > 0 ? (b.amount / total) * 100 : 0
          return (
            <div key={i} className="flex items-center gap-3">
              <span className="text-xs font-medium text-muted-foreground w-16 shrink-0">{b.label}</span>
              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${pct}%`, backgroundColor: b.color }}
                />
              </div>
              <span className="text-xs font-semibold text-foreground w-20 text-right tabular-nums shrink-0">{formatINR(b.amount)}</span>
              <span className="text-[11px] text-muted-foreground w-8 text-right shrink-0">{b.count}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ============================================================
// GSTBreakdown — rate-wise bar + table
// ============================================================

function GSTBreakdown({ hsnBreakdown }: { hsnBreakdown: { rate: number; taxableValue: number; gst: number }[] }) {
  const maxRate = Math.max(...hsnBreakdown.map(h => h.taxableValue), 1)
  return (
    <div className="rounded-2xl border border-border bg-card p-4 lg:p-5">
      <p className="text-xs font-semibold text-muted-foreground mb-4">GST Breakdown by Rate</p>
      <div className="space-y-3.5">
        {hsnBreakdown.map((h, i) => (
          <div key={i} className="flex items-center gap-3">
            <span className="text-xs font-semibold text-foreground w-12 shrink-0">{h.rate}%</span>
            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-foreground/50"
                style={{ width: `${(h.taxableValue / maxRate) * 100}%` }}
              />
            </div>
            <span className="text-xs font-semibold text-foreground w-20 text-right tabular-nums shrink-0">{formatINR(h.taxableValue)}</span>
            <span className="text-[11px] text-muted-foreground w-16 text-right tabular-nums shrink-0">{formatINR(h.gst)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ============================================================
// SalesTrend — simple bar chart with real date-range labels
// ============================================================

function shortPeriodLabel(w: { week: string; range?: { start: string; end: string } }): string {
  if (w.range) {
    const s = new Date(w.range.start)
    const e = new Date(w.range.end)
    const sDay = s.getDate()
    const eDay = e.getDate()
    const mon = s.toLocaleDateString('en-IN', { month: 'short' })
    const sameMonth = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()
    return sameMonth ? `${sDay}–${eDay} ${mon}` : `${sDay} ${mon}–${eDay} ${e.toLocaleDateString('en-IN', { month: 'short' })}`
  }
  return w.week
}

function SalesTrend({ weekly }: { weekly: { week: string; sales: number; count: number; range?: { start: string; end: string } }[] }) {
  const weeks = weekly.filter(w => w.count > 0 || w.sales > 0)
  if (weeks.length === 0) return null

  const max = Math.max(...weeks.map(w => w.sales), 1)
  const total = weeks.reduce((s, w) => s + w.sales, 0)
  const label = shortPeriodLabel(weeks[0]) + (weeks.length > 1 ? ` · ${shortPeriodLabel(weeks[weeks.length - 1])}` : '')

  return (
    <div className="rounded-2xl border border-border bg-card p-4 lg:p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Weekly Sales Trend</p>
          <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
        </div>
        <p className="text-xs font-semibold text-foreground tabular-nums">{formatINR(total)}</p>
      </div>
      <div className="flex items-end gap-1.5 h-28">
        {weeks.map((w, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end min-w-0">
            <div
              className="w-full rounded-t-lg bg-gradient-to-t from-primary/25 to-primary/50 hover:from-primary/40 hover:to-primary/60 transition-all"
              style={{ height: `${Math.max((w.sales / max) * 100, 4)}%` }}
              title={`${w.week}: ${formatINR(w.sales)}`}
            />
            <span className="text-[10px] text-muted-foreground truncate max-w-full">{shortPeriodLabel(w)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ============================================================
// MAIN PAGE
// ============================================================

export default function ReportsPage() {
  const router = useRouter()
  const reports = useReportsData()

  const [products, setProducts] = useState<any[]>([])
  const [productLoading, setProductLoading] = useState(true)

  const loadProducts = useMemo(() => async () => {
    const tenantId = getTenantId()
    if (!tenantId) { router.push('/auth'); return }
    const data = await db().products.where('tenantId').equals(tenantId).toArray()
    setProducts(data as any[])
    setProductLoading(false)
  }, [router])

  useEffect(() => { loadProducts() }, [loadProducts])

  const { loading, recovery, aging, gst, sales, purchases, dateRange, setDateRange, reload } = reports

  // ── Inventory metrics ──
  const inventoryMetrics = useMemo(() => {
    const total = products.length
    const lowStock = products.filter((p: any) => p.stock > 0 && p.stock <= (p.lowStockAt || 5)).length
    const outOfStock = products.filter((p: any) => p.stock <= 0).length
    const stockValue = products.reduce((s: number, p: any) => s + (p.stock || 0) * (p.purchasePrice || 0), 0)
    return { total, lowStock, outOfStock, stockValue }
  }, [products])

  // ── Tax metrics ──
  const taxMetrics = useMemo(() => ({
    taxableSales: gst?.taxableAmount || 0,
    gstCollected: gst?.outputGST || 0,
    inputGst: gst?.inputGST || 0,
    netGst: gst?.netGST || 0,
    purchaseCount: gst?.inputGstPurchaseCount ?? purchases?.length ?? 0,
    hasPurchaseData: !!(gst && gst.inputGstPurchaseCount > 0) || (purchases?.length || 0) > 0,
  }), [gst, purchases])

  // ── GST rate breakdown ──
  const gstRateBreakdown = useMemo(() => {
    if (!gst?.hsnBreakdown) return []
    const byRate = new Map<number, { rate: number; taxableValue: number; gst: number }>()
    for (const h of gst.hsnBreakdown) {
      const r = h.rate || 0
      const existing = byRate.get(r) || { rate: r, taxableValue: 0, gst: 0 }
      existing.taxableValue += h.taxableValue || 0
      existing.gst += (h.cgst || 0) + (h.sgst || 0) + (h.igst || 0)
      byRate.set(r, existing)
    }
    return Array.from(byRate.values()).sort((a, b) => a.rate - b.rate)
  }, [gst])

  // ── Inventory reorder list ──
  const reorderList = useMemo(() => {
    return products
      .filter((p: any) => p.stock <= (p.lowStockAt || 5))
      .sort((a: any, b: any) => a.stock - b.stock)
  }, [products])

  // ── High risk parties (from UDHARI aging) ──
  const highRiskParties = useMemo(() => {
    const all: PendingInvoice[] = []
    for (const bucket of aging) {
      if (bucket.minDays >= 30) {
        all.push(...bucket.invoices)
      }
    }
    return all
  }, [aging])

  // ── Has data check ──
  const hasAnyData = recovery || aging.length > 0 || gst.invoiceCount > 0 || sales.invoiceCount > 0

  // ── Sales hero delta (toward honest, decision-useful comparisons) ──
  const salesDelta = sales.thisMonth - sales.lastMonth
  const salesPct = sales.lastMonth > 0 ? `${sales.trend >= 0 ? '+' : ''}${sales.trend}%` : null

  // ── Named range label vs custom range (display only) ──
  const salesPeriodLabel = sales.dateRangeLabel && sales.dateRangeLabel !== 'Custom'
    ? sales.dateRangeLabel
    : formatFriendlyRange(dateRange.start, dateRange.end)

  // ── Recovery metrics (range-aware, distinguish zero from not-applicable) ──
  const hasOverdue = !!(recovery && recovery.invoicesPending > 0)
  const recoveryRate = recovery && (recovery.thisMonthRecovered > 0 || recovery.pendingAmount > 0)
    ? Math.round((recovery.thisMonthRecovered / (recovery.thisMonthRecovered + recovery.pendingAmount)) * 100)
    : null
  const avgRecoveryDays = recovery && recovery.avgRecoveryDays !== null ? `${recovery.avgRecoveryDays}d` : 'N/A'

  const refreshAll = () => {
    reload()
    loadProducts()
  }

  // ── Loading ──
  if (loading || productLoading) {
    return (
      <div className="min-h-screen bg-muted/30 pb-8">
        <div className="max-w-6xl mx-auto px-4 lg:px-8 py-5 lg:py-8 space-y-6">
          <div className="flex justify-between items-center">
            <div className="space-y-2">
              <div className="h-7 w-28 bg-muted rounded-lg animate-pulse" />
              <div className="h-3 w-44 bg-muted rounded animate-pulse" />
            </div>
            <div className="h-9 w-36 bg-muted rounded-xl animate-pulse" />
          </div>
          {[...Array(4)].map((_, i) => (
            <div key={i} className="space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 bg-muted rounded-lg animate-pulse" />
                <div className="h-4 w-24 bg-muted rounded animate-pulse" />
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                {[...Array(4)].map((_, j) => <div key={j} className="h-24 bg-card border border-border rounded-2xl animate-pulse" />)}
              </div>
              <div className="h-32 bg-card border border-border rounded-2xl animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-muted/30 pb-8">
      <div className="max-w-6xl mx-auto px-4 lg:px-8 py-5 lg:py-8 space-y-8">

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-foreground">Reports</h1>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {hasAnyData
                ? formatFriendlyRange(dateRange.start, dateRange.end)
                : 'Track how your business is doing'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={refreshAll}
              className="flex items-center justify-center w-9 h-9 border border-border rounded-xl text-muted-foreground bg-card hover:bg-muted"
              aria-label="Refresh reports"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <DateRangePicker value={dateRange} onChange={setDateRange} align="right" />
          </div>
        </div>

        {/* ── SALES ── */}
        <Section>
          <SectionHeader icon={<TrendingUp className="h-4 w-4" />} title="Sales" subtitle={salesPeriodLabel} />
          {sales.invoiceCount > 0 ? (
            <>
              {/* Revenue hero */}
              <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-5 lg:p-6">
                <div className="absolute right-0 top-0 h-full w-1/2 bg-gradient-to-l from-primary/5 to-transparent" />
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  <TrendingUp className="h-3.5 w-3.5 text-primary" /> Revenue · {salesPeriodLabel}
                </div>
                <p className="mt-2 text-4xl lg:text-5xl font-bold tracking-tight tabular-nums text-foreground">{formatINR(sales.thisMonth)}</p>
                {salesDelta !== 0 && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                      salesDelta > 0 ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger'
                    }`}>
                      {salesDelta > 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                      {salesDelta > 0 ? '+' : ''}{formatINR(Math.abs(salesDelta))}
                      {sales.lastMonth > 0 ? ` vs previous period` : ''}
                      {salesPct ? ` (${salesPct})` : ''}
                    </span>
                    {sales.lastMonth === 0 && (
                      <span className="text-xs text-muted-foreground">no previous-period sales</span>
                    )}
                  </div>
                )}
                <div className="relative mt-5 grid grid-cols-3 gap-2.5 lg:gap-3">
                  <StatTile label="Invoices" value={String(sales.invoiceCount)} />
                  <StatTile label="Avg Ticket" value={formatINR(sales.avgInvoiceValue)} />
                  <StatTile label="Previous Period" value={formatINR(sales.lastMonth)} />
                </div>
              </div>

              {sales.weeklyBreakdown.length > 0 && <SalesTrend weekly={sales.weeklyBreakdown} />}
              {sales.topCustomers.length > 0 && (
                <ActionList
                  items={sales.topCustomers}
                  renderItem={(c: any, i) => (
                    <div key={i} className="px-4 py-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-md text-[11px] font-bold ${
                          i === 0 ? 'bg-amber-500/15 text-amber-600'
                          : i === 1 ? 'bg-muted text-muted-foreground'
                          : i === 2 ? 'bg-orange-500/15 text-orange-600'
                          : 'bg-muted text-muted-foreground'
                        }`}>{i + 1}</span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                          <p className="text-xs text-muted-foreground">{c.invoiceCount} invoice{c.invoiceCount > 1 ? 's' : ''}</p>
                        </div>
                      </div>
                      <p className="text-sm font-semibold text-foreground tabular-nums shrink-0">{formatINR(c.totalAmount)}</p>
                    </div>
                  )}
                  viewAll={{ label: 'All Customers', href: '/parties' }}
                />
              )}
            </>
          ) : (
            <EmptyState
              icon={<TrendingUp className="h-4 w-4" />}
              text="No sales yet — create your first invoice"
              action={<Button size="sm" onClick={() => router.push('/pos')}><Plus className="w-4 h-4 mr-1" /> Create Invoice</Button>}
            />
          )}
        </Section>

        {/* ── MONEY ── */}
        <Section>
          <SectionHeader icon={<Wallet className="h-4 w-4" />} title="Money" subtitle="Collections & recovery" />
          {recovery ? (
            <>
              <MetricGrid>
                <MetricCard label="Collected" value={formatINR(recovery.thisMonthRecovered)}
                  trend={recovery.lastMonthRecovered > 0 ? {
                    direction: recovery.trend >= 0 ? 'up' : 'down',
                    value: `${recovery.trend >= 0 ? '+' : ''}${recovery.trend.toFixed(0)}%`,
                  } : recovery.thisMonthRecovered > 0 ? { direction: 'up', value: 'vs previous period' } : undefined} />
                <MetricCard label="Outstanding" value={formatINR(recovery.pendingAmount)} />
              </MetricGrid>

              {hasOverdue ? (
                <>
                  <MetricGrid>
                    <MetricCard
                      label="Recovery Rate"
                      value={recoveryRate !== null ? `${recoveryRate}%` : 'N/A'}
                      tag={recoveryRate !== null ? (recoveryRate > 60 ? { label: 'Healthy', color: 'bg-success-soft text-success' } : { label: 'Needs focus', color: 'bg-warning-soft text-warning' }) : undefined}
                    />
                    <MetricCard label="Avg Recovery" value={avgRecoveryDays} />
                  </MetricGrid>
                  {recovery.pendingBreakdown.length > 0 && (
                    <ActionList
                      items={recovery.pendingBreakdown}
                      renderItem={(inv: PendingInvoice, i) => (
                        <div key={i} className="px-4 py-3 flex items-center justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-foreground truncate">{inv.customerName}</p>
                            <p className="text-xs text-muted-foreground">{inv.days}d overdue</p>
                          </div>
                          <p className="text-sm font-semibold text-foreground tabular-nums shrink-0">{formatINR(inv.amount)}</p>
                          <SendReminderButton phone={inv.customerPhone} customerName={inv.customerName} amount={inv.amount} />
                        </div>
                      )}
                      viewAll={{ label: 'All Pending', href: '/invoices?status=unpaid' }}
                    />
                  )}
                </>
              ) : (
                <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-5">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-success-soft text-success">
                    <CheckCircle2 className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Nothing overdue</p>
                    <p className="text-xs text-muted-foreground">No outstanding invoices in this period — nothing needs recovery.</p>
                  </div>
                </div>
              )}
            </>
          ) : (
            <EmptyState
              icon={<Wallet className="h-4 w-4" />}
              text="No invoices recorded yet"
              action={<Button size="sm" onClick={() => router.push('/pos')}><Plus className="w-4 h-4 mr-1" /> Create Invoice</Button>}
            />
          )}
        </Section>

        {/* ── UDHARI (Signature Report) ── */}
        <Section>
          <SectionHeader icon={<Clock className="h-4 w-4" />} title="UDHARI" subtitle="Outstanding & aging" />
          {aging.length > 0 && aging.some(b => b.amount > 0) ? (
            <>
              <MetricGrid>
                <MetricCard label="Total Outstanding" value={formatINR(aging.reduce((s, b) => s + b.amount, 0))} />
                <MetricCard label="0-30 Days" value={formatINR(aging[0]?.amount || 0)}
                  tag={{ label: 'Current', color: 'bg-success-soft text-success' }} />
                <MetricCard label="30-60 Days" value={formatINR(aging[1]?.amount || 0)}
                  tag={{ label: 'Watch', color: 'bg-warning-soft text-warning' }} />
                <MetricCard label="60+ Days" value={formatINR(
                  aging.slice(2).reduce((s, b) => s + b.amount, 0)
                )} tag={{ label: 'Critical', color: 'bg-danger-soft text-danger' }} />
              </MetricGrid>

              <AgingBucketsBar buckets={aging} />

              <ExpectedRecovery aging={aging} />

              {highRiskParties.length > 0 && (
                <ActionList
                  items={highRiskParties}
                  renderItem={(inv: PendingInvoice, i) => (
                    <div key={i} className="px-4 py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">{inv.customerName}</p>
                        <p className="text-xs text-muted-foreground">{inv.days}d overdue</p>
                      </div>
                      <p className="text-sm font-semibold text-foreground tabular-nums shrink-0">{formatINR(inv.amount)}</p>
                      <div className="flex gap-1.5 shrink-0">
                        {inv.customerPhone && (
                          <button
                            onClick={() => window.open(`tel:${inv.customerPhone}`, '_blank')}
                            className="grid h-7 w-7 place-items-center rounded-lg text-[11px] font-semibold bg-muted/40 border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                            aria-label={`Call ${inv.customerName}`}
                          >
                            <Phone className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <SendReminderButton phone={inv.customerPhone} customerName={inv.customerName} amount={inv.amount} />
                      </div>
                    </div>
                  )}
                  viewAll={{ label: 'All Overdue', href: '/invoices?status=overdue' }}
                />
              )}
            </>
          ) : (
            <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6 rounded-2xl border border-border bg-card p-5 lg:p-6">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-success-soft text-success">
                <CheckCircle2 className="h-6 w-6" />
              </span>
              <div className="text-center sm:text-left">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Outstanding</p>
                <p className="text-3xl font-bold text-foreground tabular-nums tracking-tight">₹0</p>
              </div>
              <div className="hidden sm:block sm:flex-1" />
              <p className="text-sm font-semibold text-success text-center sm:text-right">All clear — nothing needs recovery</p>
            </div>
          )}
        </Section>

        {/* ── INVENTORY ── */}
        <Section>
          <SectionHeader icon={<Package className="h-4 w-4" />} title="Inventory" subtitle="Stock health" />
          {inventoryMetrics.total > 0 ? (
            <>
              <MetricGrid>
                <MetricCard label="Total Products" value={String(inventoryMetrics.total)} />
                <MetricCard label="Low Stock" value={String(inventoryMetrics.lowStock)}
                  tag={inventoryMetrics.lowStock > 0 ? { label: 'Reorder soon', color: 'bg-warning-soft text-warning' } : { label: 'OK', color: 'bg-success-soft text-success' }} />
                <MetricCard label="Out of Stock" value={String(inventoryMetrics.outOfStock)}
                  tag={inventoryMetrics.outOfStock > 0 ? { label: 'Needs restock', color: 'bg-danger-soft text-danger' } : { label: 'OK', color: 'bg-success-soft text-success' }} />
                <MetricCard label="Stock Value at Cost" value={formatINR(inventoryMetrics.stockValue)} />
              </MetricGrid>
              {reorderList.length > 0 && (
                <ActionList
                  items={reorderList}
                  renderItem={(p: any, i) => (
                    <div key={i} className="px-4 py-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-[11px] font-bold bg-muted text-muted-foreground">{i + 1}</span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                          <p className="text-xs text-muted-foreground">{p.stock} remaining · low at {p.lowStockAt || 5}</p>
                        </div>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => router.push(`/products/${p.id}`)}>
                        Restock
                      </Button>
                    </div>
                  )}
                  viewAll={{ label: 'All Products', href: '/products' }}
                />
              )}
            </>
          ) : (
            <EmptyState
              icon={<Package className="h-4 w-4" />}
              text="No products yet — start building your catalog"
              action={<Button size="sm" onClick={() => router.push('/products/add')}><Plus className="w-4 h-4 mr-1" /> Add Product</Button>}
            />
          )}
        </Section>

        {/* ── TAX ── */}
        <Section>
          <SectionHeader icon={<FileText className="h-4 w-4" />} title="Tax" subtitle="GST summary" />
          {gst.invoiceCount > 0 || gst.inputGstPurchaseCount > 0 ? (
            <>
              <MetricGrid>
                <MetricCard label="Taxable Sales" value={formatINR(taxMetrics.taxableSales)} />
                <MetricCard label="Output GST" value={formatINR(taxMetrics.gstCollected)} />
                <MetricCard
                  label="Input GST recorded"
                  value={taxMetrics.hasPurchaseData ? formatINR(taxMetrics.inputGst) : '—'}
                  tag={!taxMetrics.hasPurchaseData ? { label: 'No purchases recorded', color: 'bg-muted text-muted-foreground' } : undefined}
                />
                <MetricCard label="Net GST recorded" value={formatINR(taxMetrics.netGst)} />
              </MetricGrid>
              {gstRateBreakdown.length > 0 && <GSTBreakdown hsnBreakdown={gstRateBreakdown} />}
              {gst.hsnBreakdown.length > 0 && (
                <ActionList
                  items={gst.hsnBreakdown.slice(0, 5)}
                  renderItem={(h: any, i) => (
                    <div key={i} className="px-4 py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        {h.hsn && h.hsn !== 'N/A' ? (
                          <p className="text-sm font-medium text-foreground truncate">HSN {h.hsn}</p>
                        ) : (
                          <p className="text-sm font-medium text-muted-foreground italic">No HSN</p>
                        )}
                        <p className="text-xs text-muted-foreground">{h.qty} units · {h.rate}% GST</p>
                      </div>
                      <p className="text-sm font-semibold text-foreground tabular-nums shrink-0">{formatINR(h.taxableValue)}</p>
                    </div>
                  )}
                  viewAll={{ label: 'Full HSN Summary', href: '/reports?tab=gst' }}
                />
              )}
            </>
          ) : (
            <EmptyState
              icon={<FileText className="h-4 w-4" />}
              text="No GST data yet — create a tax invoice"
              action={<Button size="sm" onClick={() => router.push('/pos')}><Plus className="w-4 h-4 mr-1" /> Create Invoice</Button>}
            />
          )}
        </Section>

      </div>
    </div>
  )
}