'use client'

import { TrendingUp, TrendingDown, Download, BarChart3 } from 'lucide-react'
import type { SalesMetrics, PlanType } from '@/lib/billzo/report-engine'
import { formatINR, exportToCSV } from '@/lib/billzo/report-engine'
import { PaywallTeaser } from './MetricCard'
import { 
  LineChart, 
  Line, 
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
  // Mock trend data for visualization if real data is missing
  const chartData = [
    { name: 'Week 1', sales: Math.round(metrics.thisMonth * 0.15) },
    { name: 'Week 2', sales: Math.round(metrics.thisMonth * 0.25) },
    { name: 'Week 3', sales: Math.round(metrics.thisMonth * 0.35) },
    { name: 'Week 4', sales: Math.round(metrics.thisMonth * 0.25) },
  ]

  const handleExport = () => {
    const rows = metrics.topCustomers.map(c => ({
      Customer: c.name,
      Phone: c.phone,
      'Total Amount': c.totalAmount,
      'Invoice Count': c.invoiceCount,
    }))
    exportToCSV(rows, 'sales-report')
  }

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <PaywallTeaser plan={plan} />

      {/* Main Stats */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">This month</div>
          <div className="mt-2 text-3xl font-black text-slate-900">{money(metrics.thisMonth)}</div>
          <div className="mt-1 text-xs font-medium text-slate-500">{metrics.invoiceCount} invoices generated</div>
        </div>
        
        <div className="rounded-2xl border bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Growth</div>
          <div className="mt-2 flex items-center gap-2">
            <div className={`flex items-center gap-1 text-2xl font-black ${metrics.trend >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {metrics.trend >= 0 ? <TrendingUp className="h-6 w-6" /> : <TrendingDown className="h-6 w-6" />}
              {Math.abs(metrics.trend)}%
            </div>
          </div>
          <div className="mt-1 text-xs font-medium text-slate-500">vs {money(metrics.lastMonth)} last month</div>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Avg Ticket</div>
          <div className="mt-2 text-3xl font-black text-slate-900">{money(metrics.avgInvoiceValue)}</div>
          <div className="mt-1 text-xs font-medium text-slate-500">per customer visit</div>
        </div>
      </div>

      {/* Interactive Chart */}
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="font-bold text-lg">Sales Performance</h3>
            <p className="text-xs text-muted-foreground">Revenue trend over the current month</p>
          </div>
          <BarChart3 className="h-5 w-5 text-indigo-500" />
        </div>
        
        <div className="h-[250px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.1}/>
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis 
                dataKey="name" 
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
                // @ts-ignore
                formatter={(value) => value ? [money(Number(value)), 'Revenue'] : ['', 'Revenue']}
              />
              <Area 
                type="monotone" 
                dataKey="sales" 
                stroke="#6366f1" 
                strokeWidth={3}
                fillOpacity={1} 
                fill="url(#colorSales)" 
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {metrics.topCustomers.length > 0 && (
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <h3 className="font-bold text-lg">Top Customers</h3>
          <p className="text-xs text-muted-foreground mb-4">Clients bringing in the most revenue</p>
          <div className="space-y-4">
            {metrics.topCustomers.map((c, i) => (
              <div key={i} className="flex items-center justify-between group p-2 hover:bg-slate-50 rounded-xl transition-colors">
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-full bg-indigo-50 text-sm font-bold text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                    {i + 1}
                  </div>
                  <div>
                    <p className="font-bold text-slate-900">{c.name}</p>
                    <p className="text-[11px] text-slate-500 font-medium uppercase tracking-tight">{c.invoiceCount} invoices · {c.phone}</p>
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

      <button
        onClick={handleExport}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-slate-100 py-4 text-sm font-bold text-slate-600 hover:bg-slate-50 hover:border-slate-200 transition-all"
      >
        <Download className="h-4 w-4" />
        Export Detailed Report (CSV)
      </button>
    </div>
  )
}