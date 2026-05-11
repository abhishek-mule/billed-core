"use client"

import { useEffect, useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import {
  TrendingUp, TrendingDown, RefreshCcw, Send, ArrowRight,
  Download, Loader2, AlertTriangle, DollarSign, FileText,
  Package, Users, ChevronRight, Clock, AlertCircle, CheckCircle2, Zap
} from "lucide-react"
import { db } from "@/lib/billzo/db"
import {
  computeRecoveryMetrics,
  computeAgingReport,
  computeGSTReport,
  computeSalesMetrics,
  formatINR,
  type RecoveryMetrics,
  type AgingBucket,
  type GSTReport,
  type SalesMetrics,
  type PendingInvoice,
  type PlanType,
} from "@/lib/billzo/report-engine"

type Tab = 'recovery' | 'aging' | 'gst' | 'sales'

const money = (n: number) => formatINR(n)

function MetricCard({ label, value, sub, icon, highlight }: {
  label: string
  value: string
  sub?: string
  icon?: React.ReactNode
  highlight?: string
}) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-2xl font-black">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
      {highlight && (
        <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
          {highlight}
        </div>
      )}
    </div>
  )
}

function ActionCard({ title, amount, count, color, actionLabel, onAction }: {
  title: string
  amount: number
  count: number
  color: string
  actionLabel: string
  onAction: () => void
}) {
  return (
    <div className={`rounded-xl border p-4 ${color}`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm font-semibold">{title}</div>
          <div className="mt-1 text-2xl font-black">{money(amount)}</div>
          <div className="mt-1 text-xs opacity-70">{count} invoice{count !== 1 ? 's' : ''}</div>
        </div>
        <button
          onClick={onAction}
          className="rounded-lg bg-white px-3 py-2 text-xs font-bold shadow-sm"
        >
          {actionLabel}
        </button>
      </div>
    </div>
  )
}

function PaywallTeaser({ plan }: { plan: PlanType }) {
  if (plan !== 'starter') return null
  return (
    <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4 text-center">
      <p className="text-sm font-semibold text-yellow-800">
        Upgrade to Pro to see full history &amp; advanced analytics
      </p>
      <button className="mt-2 rounded-lg bg-gradient-to-r from-green-500 to-emerald-600 px-4 py-2 text-sm font-bold text-white">
        Upgrade to Pro ₹299/mo
      </button>
    </div>
  )
}

export default function ReportsPage() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('recovery')
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<{
    invoices: any[]
    invoiceItems: any[]
    payments: any[]
    whatsappEvents: any[]
    purchases: any[]
    plan: PlanType
    totalRecovered: number
  } | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const tenantId = localStorage.getItem("tenantId")
      const userId = localStorage.getItem("userId")
      if (!tenantId || !userId) {
        router.push("/login")
        return
      }

      const [invoices, invoiceItems, payments, whatsappEvents, purchases, tenant] = await Promise.all([
        db().invoices.where("tenantId").equals(tenantId).toArray(),
        db().invoiceItems.where("tenantId").equals(tenantId).toArray(),
        db().payments.where("tenantId").equals(tenantId).toArray(),
        db().whatsappEvents.where("tenantId").equals(tenantId).toArray(),
        db().purchases.where("tenantId").equals(tenantId).toArray(),
        db().tenants.get(tenantId),
      ])

      const totalRecovered = payments
        .filter((p: any) => p.status === 'success')
        .reduce((s: number, p: any) => s + p.amount, 0)

      setData({
        invoices,
        invoiceItems,
        payments,
        whatsappEvents,
        purchases,
        plan: (tenant?.plan as PlanType) || 'starter',
        totalRecovered,
      })
    } catch (error) {
      console.error("Failed to load reports:", error)
    } finally {
      setLoading(false)
    }
  }

  const recovery = useMemo<RecoveryMetrics | null>(() => {
    if (!data) return null
    return computeRecoveryMetrics(
      data.payments,
      data.invoices,
      data.whatsappEvents,
      data.plan
    )
  }, [data])

  const aging = useMemo<AgingBucket[]>(() => {
    if (!data) return []
    return computeAgingReport(data.invoices, data.plan)
  }, [data])

  const gst = useMemo<GSTReport>(() => {
    if (!data) return { totalSales: 0, outputGST: 0, inputGST: 0, netGST: 0, cgst: 0, sgst: 0, invoiceCount: 0, hsnBreakdown: [], taxableAmount: 0 }
    return computeGSTReport(data.invoices, data.invoiceItems, data.purchases)
  }, [data])

  const sales = useMemo<SalesMetrics>(() => {
    if (!data) return { thisMonth: 0, lastMonth: 0, trend: 0, topCustomers: [], topProducts: [], invoiceCount: 0, avgInvoiceValue: 0 }
    return computeSalesMetrics(data.invoices, [], [], data.plan)
  }, [data])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">Loading reports...</p>
        </div>
      </div>
    )
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'recovery', label: 'Recovery', icon: <TrendingUp className="h-4 w-4" /> },
    { id: 'aging', label: 'Aging', icon: <Clock className="h-4 w-4" /> },
    { id: 'gst', label: 'GST', icon: <FileText className="h-4 w-4" /> },
    { id: 'sales', label: 'Sales', icon: <DollarSign className="h-4 w-4" /> },
  ]

  return (
    <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="text-sm text-muted-foreground">Track your recovery performance</p>
        </div>
        <button className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
          <Download className="h-4 w-4" />
          Export
        </button>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              tab === t.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'recovery' && recovery && (
        <RecoveryTab recovery={recovery} plan={data?.plan || 'starter'} />
      )}
      {tab === 'aging' && (
        <AgingTab buckets={aging} plan={data?.plan || 'starter'} />
      )}
      {tab === 'gst' && (
        <GSTTab report={gst} />
      )}
      {tab === 'sales' && (
        <SalesTab metrics={sales} plan={data?.plan || 'starter'} />
      )}
    </div>
  )
}

function RecoveryTab({ recovery, plan }: { recovery: RecoveryMetrics; plan: PlanType }) {
  const router = useRouter()
  const roiMultiple = recovery.totalRecovered / 299

  return (
    <div className="space-y-5">
      <PaywallTeaser plan={plan} />

      {recovery.totalRecovered > 0 ? (
        <div className="rounded-2xl bg-gradient-to-br from-green-500 to-emerald-600 text-white p-6 shadow-lg">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium opacity-80">Total Recovered</p>
              <p className="mt-1 text-4xl font-black">{money(recovery.totalRecovered)}</p>
              {roiMultiple >= 1 && (
                <p className="mt-2 text-sm font-semibold">
                  That's {Math.floor(roiMultiple)}x what Pro costs!
                </p>
              )}
            </div>
            <div className="grid h-12 w-12 place-items-center rounded-xl bg-white/20">
              <TrendingUp className="h-6 w-6" />
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg bg-white/10 p-3">
              <div className="text-xs opacity-70">This month</div>
              <div className="mt-1 text-lg font-bold">{money(recovery.thisMonthRecovered)}</div>
            </div>
            <div className="rounded-lg bg-white/10 p-3">
              <div className="text-xs opacity-70">vs last month</div>
              <div className="mt-1 flex items-center gap-1 text-lg font-bold">
                {recovery.trend >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                {Math.abs(recovery.trend)}%
              </div>
            </div>
            <div className="rounded-lg bg-white/10 p-3">
              <div className="text-xs opacity-70">Avg recovery</div>
              <div className="mt-1 text-lg font-bold">{recovery.avgRecoveryDays}d</div>
            </div>
            <div className="rounded-lg bg-white/10 p-3">
              <div className="text-xs opacity-70">Invoices paid</div>
              <div className="mt-1 text-lg font-bold">{recovery.invoicesRecovered}</div>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 p-8 text-center">
          <TrendingUp className="h-12 w-12 mx-auto text-slate-300" />
          <p className="mt-3 font-bold text-slate-500">No recoveries yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Create invoices and send reminders to start tracking recovery
          </p>
          <button
            onClick={() => router.push('/scan')}
            className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Create your first invoice
          </button>
        </div>
      )}

      {recovery.pendingBreakdown.length > 0 && (
        <div className="rounded-2xl border bg-white p-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold">Pending Recovery</h3>
              <p className="text-sm text-muted-foreground">
                {recovery.invoicesPending} invoice{recovery.invoicesPending !== 1 ? 's' : ''} · {money(recovery.pendingAmount)}
              </p>
            </div>
            <button
              onClick={() => router.push('/dashboard')}
              className="flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-sm font-bold text-primary-foreground"
            >
              <Send className="h-4 w-4" />
              Send Reminders
            </button>
          </div>

          <div className="mt-4 space-y-2">
            {recovery.pendingBreakdown.slice(0, 5).map(inv => (
              <div key={inv.id} className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="font-semibold">{inv.customerName}</p>
                  <p className="text-xs text-muted-foreground">
                    {inv.days} days ago · {inv.status}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold">{money(inv.amount)}</p>
                  {plan !== 'starter' && (
                    <button
                      onClick={async () => {
                        const tenantId = localStorage.getItem("tenantId")
                        if (!tenantId) return
                        const invoice = await db().invoices.get(inv.id)
                        if (invoice) {
                          const { sendReminder } = await import('@/lib/billzo/actions')
                          await sendReminder(invoice)
                        }
                      }}
                      className="mt-1 text-xs text-primary font-medium"
                    >
                      Send reminder
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <MetricCard
          label="Pending amount"
          value={money(recovery.pendingAmount)}
          sub={`${recovery.invoicesPending} invoices`}
          icon={<AlertCircle className="h-4 w-4" />}
        />
        <MetricCard
          label="Conversion rate"
          value={recovery.invoicesRecovered + recovery.invoicesPending > 0
            ? `${Math.round((recovery.invoicesRecovered / (recovery.invoicesRecovered + recovery.invoicesPending)) * 100)}%`
            : '0%'}
          sub={`${recovery.invoicesRecovered} paid, ${recovery.invoicesPending} pending`}
          icon={<CheckCircle2 className="h-4 w-4" />}
        />
      </div>
    </div>
  )
}

function AgingTab({ buckets, plan }: { buckets: AgingBucket[]; plan: PlanType }) {
  const router = useRouter()
  const totalPending = buckets.reduce((s, b) => s + b.amount, 0)
  const totalCount = buckets.reduce((s, b) => s + b.count, 0)

  const urgencyBucket = buckets.find(b => b.count > 0)

  return (
    <div className="space-y-5">
      <PaywallTeaser plan={plan} />

      <div className="rounded-2xl border bg-white p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold">Outstanding Receivables</h3>
            <p className="text-sm text-muted-foreground">
              {totalCount} invoice{totalCount !== 1 ? 's' : ''} · {money(totalPending)}
            </p>
          </div>
          {urgencyBucket && (
            <button
              onClick={() => router.push('/dashboard')}
              className="flex items-center gap-1 rounded-lg bg-warning px-3 py-2 text-sm font-bold text-white"
            >
              <Zap className="h-4 w-4" />
              {urgencyBucket.count} need attention
            </button>
          )}
        </div>
      </div>

      {totalCount === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 p-8 text-center">
          <CheckCircle2 className="h-12 w-12 mx-auto text-green-400" />
          <p className="mt-3 font-bold text-slate-500">All clear!</p>
          <p className="mt-1 text-sm text-muted-foreground">No outstanding invoices</p>
        </div>
      ) : (
        <div className="space-y-3">
          {buckets.map(bucket => (
            <div key={bucket.label} className={`rounded-xl border p-4 ${bucket.count > 0 ? 'border-2' : 'opacity-60'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`grid h-10 w-10 place-items-center rounded-lg font-bold text-sm ${
                    bucket.label === '0-7 days' ? 'bg-green-100 text-green-700' :
                    bucket.label === '8-30 days' ? 'bg-yellow-100 text-yellow-700' :
                    bucket.label === '31-60 days' ? 'bg-orange-100 text-orange-700' :
                    'bg-red-100 text-red-700'
                  }`}>
                    {bucket.count}
                  </div>
                  <div>
                    <p className="font-bold">{bucket.label}</p>
                    <p className="text-sm text-muted-foreground">{bucket.count} invoice{bucket.count !== 1 ? 's' : ''}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xl font-black">{money(bucket.amount)}</p>
                  {bucket.count > 0 && plan !== 'starter' && (
                    <button
                      onClick={() => router.push('/dashboard')}
                      className="mt-1 text-xs font-medium text-primary"
                    >
                      Send reminders
                    </button>
                  )}
                </div>
              </div>
              {bucket.count > 0 && (
                <div className="mt-3 border-t pt-3 space-y-2">
                  {bucket.invoices.slice(0, 3).map(inv => (
                    <div key={inv.id} className="flex items-center justify-between text-sm">
                      <span className="font-medium">{inv.customerName}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-muted-foreground">{inv.days}d</span>
                        <span className="font-bold">{money(inv.amount)}</span>
                      </div>
                    </div>
                  ))}
                  {bucket.invoices.length > 3 && (
                    <p className="text-xs text-muted-foreground">+{bucket.invoices.length - 3} more</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <button
        onClick={() => {
          const rows = buckets.flatMap(b => b.invoices.map(inv => ({
            Customer: inv.customerName,
            Phone: inv.customerPhone,
            Amount: inv.amount,
            'Days Overdue': inv.days,
            Status: inv.status,
          })))
          import('@/lib/billzo/report-engine').then(m => m.exportToCSV(rows, 'aging-report'))
        }}
        className="flex w-full items-center justify-center gap-2 rounded-xl border py-3 text-sm font-medium"
      >
        <Download className="h-4 w-4" />
        Export to CSV
      </button>
    </div>
  )
}

function GSTTab({ report }: { report: GSTReport }) {
  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white p-6 shadow-lg">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium opacity-80">GST Summary</p>
            <p className="mt-1 text-4xl font-black">
              {new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}
            </p>
            <p className="mt-1 text-sm opacity-70">{report.invoiceCount} invoices</p>
          </div>
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-white/20">
            <FileText className="h-6 w-6" />
          </div>
        </div>
        <div className="mt-6 grid grid-cols-3 gap-3">
          <div className="rounded-lg bg-white/10 p-3">
            <div className="text-xs opacity-70">Total Sales</div>
            <div className="mt-1 text-lg font-bold">{money(report.totalSales)}</div>
          </div>
          <div className="rounded-lg bg-white/10 p-3">
            <div className="text-xs opacity-70">Output GST</div>
            <div className="mt-1 text-lg font-bold">{money(report.outputGST)}</div>
          </div>
          <div className="rounded-lg bg-white/10 p-3">
            <div className="text-xs opacity-70">Net GST</div>
            <div className="mt-1 text-lg font-bold">{money(report.netGST)}</div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <MetricCard
          label="CGST Collected"
          value={money(report.cgst)}
          sub="Half of output GST"
          icon={<ArrowRight className="h-4 w-4" />}
        />
        <MetricCard
          label="SGST Collected"
          value={money(report.sgst)}
          sub="Half of output GST"
          icon={<ArrowRight className="h-4 w-4" />}
        />
      </div>

      {report.hsnBreakdown.length > 0 ? (
        <div className="rounded-2xl border bg-white p-5">
          <h3 className="font-bold">HSN-wise Summary</h3>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2 font-medium text-muted-foreground">HSN</th>
                  <th className="pb-2 font-medium text-muted-foreground text-right">Taxable Value</th>
                  <th className="pb-2 font-medium text-muted-foreground text-right">Rate</th>
                  <th className="pb-2 font-medium text-muted-foreground text-right">CGST</th>
                  <th className="pb-2 font-medium text-muted-foreground text-right">SGST</th>
                  <th className="pb-2 font-medium text-muted-foreground text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {report.hsnBreakdown.map(item => (
                  <tr key={item.hsn} className="border-b last:border-0">
                    <td className="py-2 font-mono font-medium">{item.hsn}</td>
                    <td className="py-2 text-right">{money(item.taxableValue)}</td>
                    <td className="py-2 text-right">{item.rate}%</td>
                    <td className="py-2 text-right">{money(item.cgst)}</td>
                    <td className="py-2 text-right">{money(item.sgst)}</td>
                    <td className="py-2 text-right font-bold">{money(item.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 p-6 text-center">
          <FileText className="h-10 w-10 mx-auto text-slate-300" />
          <p className="mt-2 font-semibold text-slate-500">No GST data yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Create invoices to see GST breakdown</p>
        </div>
      )}

      <button
        onClick={() => {
          const rows = report.hsnBreakdown.map(item => ({
            HSN: item.hsn,
            Description: item.description,
            Qty: item.qty,
            'Taxable Value': item.taxableValue,
            Rate: `${item.rate}%`,
            CGST: item.cgst,
            SGST: item.sgst,
            Total: item.total,
          }))
          import('@/lib/billzo/report-engine').then(m => m.exportToCSV(rows, 'gst-report'))
        }}
        className="flex w-full items-center justify-center gap-2 rounded-xl border py-3 text-sm font-medium"
      >
        <Download className="h-4 w-4" />
        Export GSTR-1
      </button>
    </div>
  )
}

function SalesTab({ metrics, plan }: { metrics: SalesMetrics; plan: PlanType }) {
  return (
    <div className="space-y-5">
      <PaywallTeaser plan={plan} />

      <div className="rounded-2xl border bg-white p-5">
        <h3 className="font-bold">Sales Overview</h3>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border p-4">
            <div className="text-xs text-muted-foreground">This month</div>
            <div className="mt-1 text-2xl font-black">{money(metrics.thisMonth)}</div>
            <div className="mt-1 text-xs text-muted-foreground">{metrics.invoiceCount} invoices</div>
          </div>
          <div className="rounded-xl border p-4">
            <div className="text-xs text-muted-foreground">vs last month</div>
            <div className="mt-1 flex items-center gap-1 text-2xl font-black">
              {metrics.trend >= 0 ? <TrendingUp className="h-5 w-5 text-green-600" /> : <TrendingDown className="h-5 w-5 text-red-600" />}
              {Math.abs(metrics.trend)}%
            </div>
            <div className="mt-1 text-xs text-muted-foreground">vs {money(metrics.lastMonth)}</div>
          </div>
          <div className="rounded-xl border p-4">
            <div className="text-xs text-muted-foreground">Avg invoice value</div>
            <div className="mt-1 text-2xl font-black">{money(metrics.avgInvoiceValue)}</div>
            <div className="mt-1 text-xs text-muted-foreground">per invoice</div>
          </div>
        </div>
      </div>

      {metrics.topCustomers.length > 0 && (
        <div className="rounded-2xl border bg-white p-5">
          <h3 className="font-bold">Top Customers</h3>
          <div className="mt-4 space-y-3">
            {metrics.topCustomers.map((c, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="grid h-8 w-8 place-items-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                    {i + 1}
                  </div>
                  <div>
                    <p className="font-semibold">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.invoiceCount} invoices</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold">{money(c.totalAmount)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={() => {
          const rows = metrics.topCustomers.map(c => ({
            Customer: c.name,
            Phone: c.phone,
            'Total Amount': c.totalAmount,
            'Invoice Count': c.invoiceCount,
          }))
          import('@/lib/billzo/report-engine').then(m => m.exportToCSV(rows, 'sales-report'))
        }}
        className="flex w-full items-center justify-center gap-2 rounded-xl border py-3 text-sm font-medium"
      >
        <Download className="h-4 w-4" />
        Export to CSV
      </button>
    </div>
  )
}