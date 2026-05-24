'use client'

import { TrendingUp, TrendingDown, Download, BarChart3, FileText } from 'lucide-react'
import type { SalesMetrics, PlanType } from '@/lib/billzo/report-engine'
import { formatINR, exportToCSV } from '@/lib/billzo/report-engine'
import { downloadSalesReportPDF } from '@/lib/billzo/pdf'
import { PaywallTeaser } from './MetricCard'
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts'

const money = (n: number) => formatINR(n)

interface SalesTabProps {
  metrics: SalesMetrics
  plan: PlanType
}

export function SalesTab({ metrics, plan }: SalesTabProps) {
  const handleExport = () => {
    const customerRows = metrics.topCustomers.map(c => ({
      Customer: c.name,
      Phone: c.phone,
      'Total Amount': c.totalAmount,
      'Invoice Count': c.invoiceCount,
      'Revenue Rank': metrics.topCustomers.indexOf(c) + 1,
    }))
    const productRows = metrics.topProducts.map((p, i) => ({
      'Product Name': p.name,
      'Units Sold': p.qty,
      'Revenue': p.revenue,
      'Revenue Rank': i + 1,
    }))
    exportToCSV([...customerRows, {}, ...productRows], 'sales-report')
  }

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <PaywallTeaser plan={plan} />

      {/* Main Stats */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
          <div className="text-xs font-bold text-muted-foreground/60 uppercase tracking-wider">This month</div>
          <div className="mt-2 text-3xl font-black text-foreground">{money(metrics.thisMonth)}</div>
          <div className="mt-1 text-xs font-medium text-muted-foreground">{metrics.invoiceCount} invoices generated</div>
        </div>

        <div className="rounded-2xl border bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
          <div className="text-xs font-bold text-muted-foreground/60 uppercase tracking-wider">Growth</div>
          <div className="mt-2 flex items-center gap-2">
            <div className={`flex items-center gap-1 text-2xl font-black ${metrics.trend >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {metrics.trend >= 0 ? <TrendingUp className="h-6 w-6" /> : <TrendingDown className="h-6 w-6" />}
              {Math.abs(metrics.trend)}%
            </div>
          </div>
          <div className="mt-1 text-xs font-medium text-muted-foreground">vs {money(metrics.lastMonth)} last month</div>
        </div>

        <div className="rounded-2xl border bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
          <div className="text-xs font-bold text-muted-foreground/60 uppercase tracking-wider">Avg Ticket</div>
          <div className="mt-2 text-3xl font-black text-foreground">{money(metrics.avgInvoiceValue)}</div>
          <div className="mt-1 text-xs font-medium text-muted-foreground">per customer visit</div>
        </div>
      </div>

      {/* Sales Chart */}
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="font-bold text-lg">Sales Performance</h3>
            <p className="text-xs text-muted-foreground">{metrics.dateRangeLabel || 'Custom range'}</p>
          </div>
          <BarChart3 className="h-5 w-5 text-primary" />
        </div>

        <div className="h-[250px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={metrics.weeklyBreakdown}>
              <defs>
                <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#15803d" stopOpacity={0.1}/>
                  <stop offset="95%" stopColor="#15803d" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis
                dataKey="week"
                axisLine={false}
                tickLine={false}
                tick={{fontSize: 12, fill: '#64748b'}}
                dy={10}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{fontSize: 12, fill: '#64748b'}}
                tickFormatter={(value) => `₹${value >= 1000 ? (value/1000).toFixed(1) + 'k' : value}`}
              />
              <Tooltip
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                formatter={(value) => value ? [money(Number(value)), 'Revenue'] : ['', 'Revenue']}
                labelFormatter={(label) => {
                  const week = metrics.weeklyBreakdown.find((w) => w.week === label)
                  return week ? `${label} (${week.count} invoice${week.count !== 1 ? 's' : ''})` : label
                }}
              />
              <Area
                type="monotone"
                dataKey="sales"
                stroke="#15803d"
                strokeWidth={3}
                fillOpacity={1}
                fill="url(#colorSales)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top Products */}
      {metrics.topProducts.length > 0 && (
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <h3 className="font-bold text-lg">Top Products</h3>
          <p className="text-xs text-muted-foreground mb-4">Best-selling by revenue</p>
          <div className="space-y-4">
            {metrics.topProducts.map((p, i) => (
              <div key={i} className="flex items-center justify-between group p-2 hover:bg-slate-50 rounded-xl transition-colors">
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-full bg-primary/10 text-sm font-bold text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                    {i + 1}
                  </div>
                  <div>
                    <p className="font-bold text-foreground">{p.name}</p>
                    <p className="text-[11px] font-medium tracking-tight text-muted-foreground">{p.qty} units sold</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-black text-slate-900 text-lg">{money(p.revenue)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top Customers */}
      {metrics.topCustomers.length > 0 && (
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <h3 className="font-bold text-lg">Top Customers</h3>
          <p className="text-xs text-muted-foreground mb-4">Clients bringing in the most revenue</p>
          <div className="space-y-4">
            {metrics.topCustomers.map((c, i) => (
              <div key={i} className="flex items-center justify-between group p-2 hover:bg-slate-50 rounded-xl transition-colors">
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-full bg-primary/10 text-sm font-bold text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                    {i + 1}
                  </div>
                  <div>
                    <p className="font-bold text-foreground">{c.name}</p>
                    <p className="text-[11px] font-medium uppercase tracking-tight text-muted-foreground">{c.invoiceCount} invoices · {c.phone}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-black text-slate-900 text-lg">{money(c.totalAmount)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={handleExport}
          className="flex items-center justify-center gap-2 rounded-xl border-2 border-border py-4 text-sm font-bold text-muted-foreground transition-all hover:border-border/80 hover:bg-muted"
        >
          <Download className="h-4 w-4" />
          CSV Export
        </button>
        <button
          onClick={() => downloadSalesReportPDF(metrics, 'BillZo Business', metrics.dateRangeLabel || 'This Month')}
          className="flex items-center justify-center gap-2 rounded-xl border-2 border-primary/20 bg-primary/5 py-4 text-sm font-bold text-primary transition-all hover:border-primary/30 hover:bg-primary/10"
        >
          <FileText className="h-4 w-4" />
          Download PDF
        </button>
      </div>
    </div>
  )
}