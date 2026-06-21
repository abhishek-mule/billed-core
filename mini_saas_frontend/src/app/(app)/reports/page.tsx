'use client'

import { useEffect, useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import {
  TrendingUp, Clock, FileText, DollarSign, Package, AlertTriangle,
  Plus, ChevronRight, Calendar, Users, ShoppingCart, Receipt,
  ArrowUpRight, ArrowDownRight, Wallet, Percent, Box, BarChart3,
  Phone, MessageSquare, Send,
} from "lucide-react"
import { Button } from "@/components/billzo/Button"
import { db } from "@/lib/billzo/db"
import { formatINR } from "@/lib/utils"
import { getCookie } from "@/lib/cookies"
import { useReportsData } from "@/components/reports/useReportsData"
import { DateRangePicker } from "@/components/reports/DateRangePicker"
import type {
  RecoveryMetrics, AgingBucket, GSTReport, SalesMetrics,
  PendingInvoice, PlanType, DateRange,
} from "@/lib/billzo/report-engine"

// ============================================================
// MetricRow — single KPI with label, value, optional trend/tag
// ============================================================

function MetricRow({ label, value, trend, tag }: {
  label: string
  value: string
  trend?: { direction: 'up' | 'down' | 'neutral'; value: string }
  tag?: { label: string; color: string }
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-3 lg:p-4">
      <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider mb-1">{label}</p>
      <p className="text-lg lg:text-xl font-semibold text-slate-900 tabular-nums">{value}</p>
      <div className="flex items-center gap-2 mt-1">
        {trend && (
          <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${
            trend.direction === 'up' ? 'text-emerald-600' :
            trend.direction === 'down' ? 'text-rose-600' :
            'text-slate-400'
          }`}>
            {trend.direction === 'up' ? <ArrowUpRight className="w-3 h-3" /> :
             trend.direction === 'down' ? <ArrowDownRight className="w-3 h-3" /> : null}
            {trend.value}
          </span>
        )}
        {tag && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${tag.color}`}>{tag.label}</span>
        )}
      </div>
    </div>
  )
}

// ============================================================
// Bar viz — simple stacked/minimalist bar for distributions
// ============================================================

function SimpleBar({ items, maxHeight = 48 }: {
  items: { label: string; value: number; color: string }[]
  maxHeight?: number
}) {
  const max = Math.max(...items.map(i => i.value), 1)
  return (
    <div className="flex items-end gap-2 h-12">
      {items.map((item, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
          <div
            className="w-full rounded-t"
            style={{
              height: `${(item.value / max) * maxHeight}px`,
              backgroundColor: item.color,
              opacity: 0.7,
            }}
          />
          <span className="text-[9px] text-slate-400 font-medium whitespace-nowrap">{item.label}</span>
        </div>
      ))}
    </div>
  )
}

// ============================================================
// MiniTrend — sparkline-style weekly trend
// ============================================================

function MiniTrend({ data, height = 40 }: {
  data: { week: string; sales: number }[]
  height?: number
}) {
  const max = Math.max(...data.map(d => d.sales), 1)
  const w = Math.max(4, data.length > 0 ? Math.floor(200 / data.length) : 4)
  return (
    <div className="flex items-end gap-[2px] h-10">
      {data.map((d, i) => (
        <div
          key={i}
          className="w-full rounded-t bg-slate-900/10"
          style={{ height: `${(d.sales / max) * height}px`, maxWidth: `${w}px` }}
          title={`${d.week}: ${formatINR(d.sales)}`}
        />
      ))}
    </div>
  )
}

// ============================================================
// MetricGrid — 4-column KPI cluster
// ============================================================

function MetricGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 lg:gap-3">
      {children}
    </div>
  )
}

// ============================================================
// ActionList — numbered actionable items
// ============================================================

function ActionList({ items, renderItem, viewAll }: {
  items: any[]
  renderItem: (item: any, i: number) => React.ReactNode
  viewAll?: { label: string; href: string }
}) {
  if (items.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-6 text-center">
        <p className="text-sm text-slate-400">All clear — nothing needs attention</p>
      </div>
    )
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="divide-y divide-slate-100">
        {items.slice(0, 5).map((item, i) => renderItem(item, i))}
      </div>
      {viewAll && items.length > 5 && (
        <div className="px-4 py-2 border-t border-slate-100">
          <button
            onClick={() => window.location.href = viewAll.href}
            className="text-xs text-slate-500 hover:text-slate-700 font-medium flex items-center gap-1"
          >
            View All ({items.length}) <ChevronRight className="w-3 h-3" />
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
    <div className="flex items-center gap-2 mb-3">
      <div className="w-6 h-6 rounded bg-slate-100 flex items-center justify-center">
        {icon}
      </div>
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      {subtitle && <span className="text-xs text-slate-400">{subtitle}</span>}
    </div>
  )
}

// ============================================================
// Section wrapper
// ============================================================

function Section({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      {children}
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
      const tenantId = getCookie('bz_tenant')
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
    } catch {}
  }

  return (
    <button
      onClick={handleClick}
      className={`text-xs px-2 py-1 rounded font-medium transition-colors ${
        sent ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
        'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'
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
    when: b.label,
  }))

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4">
      <p className="text-xs font-medium text-slate-500 mb-3">Expected Recovery Timeline</p>
      <div className="h-3 bg-slate-100 rounded-full overflow-hidden flex">
        {bands.map((b, i) => (
          <div
            key={i}
            style={{ width: `${b.pct}%`, backgroundColor: b.color, opacity: 0.8 }}
            className="first:rounded-l-full last:rounded-r-full"
            title={`${b.label}: ${formatINR(b.amount)}`}
          />
        ))}
      </div>
      <div className="grid grid-cols-4 gap-2 mt-3">
        {bands.map((b, i) => (
          <div key={i} className="text-center">
            <p className="text-[9px] text-slate-400 font-medium">{b.label}</p>
            <p className="text-xs font-semibold text-slate-700 tabular-nums">{formatINR(b.amount)}</p>
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
    <div className="bg-white border border-slate-200 rounded-lg p-4">
      <p className="text-xs font-medium text-slate-500 mb-3">Aging Buckets</p>
      <div className="space-y-2">
        {buckets.map((b, i) => {
          const pct = total > 0 ? (b.amount / total) * 100 : 0
          return (
            <div key={i} className="flex items-center gap-3">
              <span className="text-xs text-slate-600 w-16 shrink-0 font-medium">{b.label}</span>
              <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${pct}%`, backgroundColor: b.color }}
                />
              </div>
              <span className="text-xs text-slate-700 w-20 text-right tabular-nums font-medium">{formatINR(b.amount)}</span>
              <span className="text-[10px] text-slate-400 w-8 text-right">{b.count}</span>
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
    <div className="bg-white border border-slate-200 rounded-lg p-4">
      <p className="text-xs font-medium text-slate-500 mb-3">GST Breakdown by Rate</p>
      <div className="space-y-2">
        {hsnBreakdown.map((h, i) => (
          <div key={i} className="flex items-center gap-3">
            <span className="text-xs text-slate-600 w-12 shrink-0 font-medium">{h.rate}%</span>
            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-slate-600/50"
                style={{ width: `${(h.taxableValue / maxRate) * 100}%` }}
              />
            </div>
            <span className="text-xs text-slate-700 w-20 text-right tabular-nums font-medium">{formatINR(h.taxableValue)}</span>
            <span className="text-xs text-slate-400 w-16 text-right tabular-nums">{formatINR(h.gst)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ============================================================
// Sales Trend (simple bar chart)
// ============================================================

function SalesTrend({ weekly }: { weekly: { week: string; sales: number }[] }) {
  const max = Math.max(...weekly.map(w => w.sales), 1)
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4">
      <p className="text-xs font-medium text-slate-500 mb-3">Weekly Sales Trend</p>
      <div className="flex items-end gap-1.5 h-24">
        {weekly.map((w, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1">
            <div
              className="w-full rounded-t bg-slate-900/10 hover:bg-slate-900/20 transition-colors"
              style={{ height: `${(w.sales / max) * 80}%` }}
              title={`${w.week}: ${formatINR(w.sales)}`}
            />
            <span className="text-[8px] text-slate-400 whitespace-nowrap">{w.week.slice(0, 3)}</span>
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

  useEffect(() => {
    const tenantId = getCookie('bz_tenant')
    if (!tenantId) { router.push('/auth'); return }
    ;(async () => {
      const data = await db().products.where('tenantId').equals(tenantId).toArray()
      setProducts(data as any[])
      setProductLoading(false)
    })()
  }, [router])

  const { loading, error, recovery, aging, gst, sales, plan, dateRange, setDateRange, reload, invoices, payments } = reports

  // ── Money metrics from recovery data ──
  const moneyMetrics = useMemo(() => {
    const totalCollected = payments?.filter((p: any) => p.status === 'success').reduce((s: number, p: any) => s + p.amount, 0) || 0
    const pendingInvoices = invoices?.filter((i: any) => i.outstanding > 0).length || 0
    const pendingAmount = invoices?.filter((i: any) => i.outstanding > 0).reduce((s: number, i: any) => s + i.outstanding, 0) || 0
    const recoveryRate = totalCollected > 0 ? ((totalCollected / (totalCollected + pendingAmount)) * 100).toFixed(0) : '0'
    return { totalCollected, pendingInvoices, pendingAmount, recoveryRate }
  }, [payments, invoices])

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
  }), [gst])

  // ── GST rate breakdown ──
  const gstRateBreakdown = useMemo(() => {
    if (!gst?.hsnBreakdown) return []
    const byRate = new Map<number, { rate: number; taxableValue: number; gst: number }>()
    for (const h of gst.hsnBreakdown) {
      const r = h.rate || 0
      const existing = byRate.get(r) || { rate: r, taxableValue: 0, gst: 0 }
      existing.taxableValue += h.taxableValue || 0
      existing.gst += (h.cgst || 0) + (h.sgst || 0)
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

  // ── Loading ──
  if (loading || productLoading) {
    return (
      <div className="min-h-screen bg-slate-50 pb-8">
        <div className="max-w-6xl mx-auto px-4 lg:px-8 py-5 lg:py-8 space-y-6">
          <div className="flex justify-between">
            <div className="h-8 w-48 bg-slate-200 rounded animate-pulse" />
            <div className="h-9 w-40 bg-slate-200 rounded animate-pulse" />
          </div>
          {[...Array(5)].map((_, i) => (
            <div key={i} className="space-y-3">
              <div className="h-5 w-32 bg-slate-200 rounded animate-pulse" />
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[...Array(4)].map((_, j) => <div key={j} className="h-20 bg-white border border-slate-200 rounded-lg animate-pulse" />)}
              </div>
              <div className="h-32 bg-white border border-slate-200 rounded-lg animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-8">
      <div className="max-w-6xl mx-auto px-4 lg:px-8 py-5 lg:py-8 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-xs text-slate-500 mt-0.5">
              {hasAnyData ? `${dateRange.start} — ${dateRange.end}` : 'Track your business performance'}
            </p>
          </div>

          <DateRangePicker value={dateRange} onChange={setDateRange} />
        </div>

        {/* ── SALES ── */}
        <Section>
          <SectionHeader icon={<TrendingUp className="w-3.5 h-3.5 text-slate-500" />} title="Sales" subtitle={sales.dateRangeLabel} />
          {sales.invoiceCount > 0 ? (
            <>
              <MetricGrid>
                <MetricRow label="Revenue" value={formatINR(sales.thisMonth)}
                  trend={{
                    direction: sales.trend >= 0 ? 'up' : 'down',
                    value: `${sales.trend >= 0 ? '+' : ''}${sales.trend.toFixed(0)}%`,
                  }} />
                <MetricRow label="Avg Ticket" value={formatINR(sales.avgInvoiceValue)} />
                <MetricRow label="Invoices" value={String(sales.invoiceCount)} />
                <MetricRow label="Last Month" value={formatINR(sales.lastMonth)}
                  tag={{ label: 'vs previous', color: 'text-slate-400' }} />
              </MetricGrid>
              {sales.weeklyBreakdown.length > 0 && <SalesTrend weekly={sales.weeklyBreakdown} />}
              {sales.topCustomers.length > 0 && (
                <ActionList
                  items={sales.topCustomers}
                  renderItem={(c: any, i) => (
                    <div key={i} className="px-4 py-2.5 flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-xs text-slate-400 w-4 shrink-0">{i + 1}</span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900 truncate">{c.name}</p>
                          <p className="text-xs text-slate-500">{c.invoiceCount} invoice{c.invoiceCount > 1 ? 's' : ''}</p>
                        </div>
                      </div>
                      <p className="text-sm font-semibold text-slate-900 tabular-nums">{formatINR(c.totalAmount)}</p>
                    </div>
                  )}
                  viewAll={{ label: 'All Customers', href: '/parties' }}
                />
              )}
            </>
          ) : (
            <div className="bg-white border border-slate-200 rounded-lg p-6 text-center">
              <p className="text-sm text-slate-400 mb-3">No sales data yet</p>
              <Button size="sm" onClick={() => router.push('/pos')}><Plus className="w-4 h-4 mr-1" /> Create Invoice</Button>
            </div>
          )}
        </Section>

        {/* ── MONEY ── */}
        <Section>
          <SectionHeader icon={<Wallet className="w-3.5 h-3.5 text-slate-500" />} title="Money" subtitle="Collections & recovery" />
          {recovery && moneyMetrics.totalCollected > 0 ? (
            <>
              <MetricGrid>
                <MetricRow label="Total Collected" value={formatINR(moneyMetrics.totalCollected)}
                  trend={recovery.trend !== 0 ? {
                    direction: recovery.trend >= 0 ? 'up' : 'down',
                    value: `${recovery.trend >= 0 ? '+' : ''}${recovery.trend.toFixed(0)}%`,
                  } : undefined} />
                <MetricRow label="Pending" value={formatINR(moneyMetrics.pendingAmount)} />
                <MetricRow label="Recovery Rate" value={`${moneyMetrics.recoveryRate}%`}
                  tag={parseInt(moneyMetrics.recoveryRate) > 60 ? { label: 'Healthy', color: 'text-emerald-600' } : { label: 'Needs focus', color: 'text-amber-600' }} />
                <MetricRow label="Avg Recovery" value={`${recovery.avgRecoveryDays}d`} />
              </MetricGrid>
              {recovery.pendingBreakdown.length > 0 && (
                <ActionList
                  items={recovery.pendingBreakdown}
                  renderItem={(inv: PendingInvoice, i) => (
                    <div key={i} className="px-4 py-2.5 flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-900 truncate">{inv.customerName}</p>
                        <p className="text-xs text-slate-500">{inv.days}d overdue · {formatINR(inv.amount)}</p>
                      </div>
                      <SendReminderButton phone={inv.customerPhone} customerName={inv.customerName} amount={inv.amount} />
                    </div>
                  )}
                  viewAll={{ label: 'All Pending', href: '/invoices?status=unpaid' }}
                />
              )}
            </>
          ) : (
            <div className="bg-white border border-slate-200 rounded-lg p-6 text-center">
              <p className="text-sm text-slate-400 mb-3">No collection data yet</p>
              <Button size="sm" onClick={() => router.push('/pulse')}><Wallet className="w-4 h-4 mr-1" /> Record Payment</Button>
            </div>
          )}
        </Section>

        {/* ── UDHARI (Signature Report) ── */}
        <Section>
          <SectionHeader icon={<Clock className="w-3.5 h-3.5 text-slate-500" />} title="UDHARI" subtitle="Outstanding & aging" />
          {aging.length > 0 && aging.some(b => b.amount > 0) ? (
            <>
              <MetricGrid>
                <MetricRow label="Total Outstanding" value={formatINR(aging.reduce((s, b) => s + b.amount, 0))} />
                <MetricRow label="0-30 Days" value={formatINR(aging[0]?.amount || 0)}
                  tag={{ label: 'Current', color: 'text-emerald-600' }} />
                <MetricRow label="30-60 Days" value={formatINR(aging[1]?.amount || 0)}
                  tag={{ label: 'Watch', color: 'text-amber-600' }} />
                <MetricRow label="60+ Days" value={formatINR(
                  aging.slice(2).reduce((s, b) => s + b.amount, 0)
                )} tag={{ label: 'Critical', color: 'text-rose-600' }} />
              </MetricGrid>

              <AgingBucketsBar buckets={aging} />

              <ExpectedRecovery aging={aging} />

              {highRiskParties.length > 0 && (
                <ActionList
                  items={highRiskParties}
                  renderItem={(inv: PendingInvoice, i) => (
                    <div key={i} className="px-4 py-2.5 flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-900 truncate">{inv.customerName}</p>
                        <p className="text-xs text-slate-500">{inv.days}d overdue · {formatINR(inv.amount)}</p>
                      </div>
                      <div className="flex gap-1.5">
                        {inv.customerPhone && (
                          <button
                            onClick={() => window.open(`tel:${inv.customerPhone}`, '_blank')}
                            className="text-xs px-2 py-1 rounded font-medium bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100"
                          >
                            <Phone className="w-3 h-3" />
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
            <div className="bg-white border border-slate-200 rounded-lg p-6 text-center">
              <p className="text-sm text-slate-400">No outstanding invoices — all clear</p>
            </div>
          )}
        </Section>

        {/* ── INVENTORY ── */}
        <Section>
          <SectionHeader icon={<Package className="w-3.5 h-3.5 text-slate-500" />} title="Inventory" subtitle="Stock health" />
          {inventoryMetrics.total > 0 ? (
            <>
              <MetricGrid>
                <MetricRow label="Total Products" value={String(inventoryMetrics.total)} />
                <MetricRow label="Low Stock" value={String(inventoryMetrics.lowStock)}
                  tag={inventoryMetrics.lowStock > 0 ? { label: 'Reorder soon', color: 'text-amber-600' } : { label: 'OK', color: 'text-emerald-600' }} />
                <MetricRow label="Out of Stock" value={String(inventoryMetrics.outOfStock)}
                  tag={inventoryMetrics.outOfStock > 0 ? { label: 'Needs restock', color: 'text-rose-600' } : { label: 'OK', color: 'text-emerald-600' }} />
                <MetricRow label="Stock Value" value={formatINR(inventoryMetrics.stockValue)} />
              </MetricGrid>
              {reorderList.length > 0 && (
                <ActionList
                  items={reorderList}
                  renderItem={(p: any, i) => (
                    <div key={i} className="px-4 py-2.5 flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-xs text-slate-400 w-4 shrink-0">{i + 1}</span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900 truncate">{p.name}</p>
                          <p className="text-xs text-slate-500">{p.stock} remaining · low at {p.lowStockAt || 5}</p>
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
            <div className="bg-white border border-slate-200 rounded-lg p-6 text-center">
              <p className="text-sm text-slate-400 mb-3">No products yet</p>
              <Button size="sm" onClick={() => router.push('/products/add')}><Plus className="w-4 h-4 mr-1" /> Add Product</Button>
            </div>
          )}
        </Section>

        {/* ── TAX ── */}
        <Section>
          <SectionHeader icon={<FileText className="w-3.5 h-3.5 text-slate-500" />} title="Tax" subtitle="GST summary" />
          {gst.invoiceCount > 0 ? (
            <>
              <MetricGrid>
                <MetricRow label="Taxable Sales" value={formatINR(taxMetrics.taxableSales)} />
                <MetricRow label="GST Collected" value={formatINR(taxMetrics.gstCollected)} />
                <MetricRow label="Input GST" value={formatINR(taxMetrics.inputGst)} />
                <MetricRow label="Net GST" value={formatINR(taxMetrics.netGst)} />
              </MetricGrid>
              {gstRateBreakdown.length > 0 && <GSTBreakdown hsnBreakdown={gstRateBreakdown} />}
              {gst.hsnBreakdown.length > 0 && (
                <ActionList
                  items={gst.hsnBreakdown.slice(0, 5)}
                  renderItem={(h: any, i) => (
                    <div key={i} className="px-4 py-2.5 flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-900 truncate">HSN {h.hsn}</p>
                        <p className="text-xs text-slate-500">{h.qty} units · {h.rate}% GST</p>
                      </div>
                      <p className="text-sm font-semibold text-slate-900 tabular-nums">{formatINR(h.taxableValue)}</p>
                    </div>
                  )}
                  viewAll={{ label: 'Full HSN Summary', href: '/reports?tab=gst' }}
                />
              )}
            </>
          ) : (
            <div className="bg-white border border-slate-200 rounded-lg p-6 text-center">
              <p className="text-sm text-slate-400 mb-3">No GST data yet</p>
              <Button size="sm" onClick={() => router.push('/pos')}><Plus className="w-4 h-4 mr-1" /> Create Invoice</Button>
            </div>
          )}
        </Section>

      </div>
    </div>
  )
}
