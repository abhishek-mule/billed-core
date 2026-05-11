'use client'

import { TrendingUp, TrendingDown, Download } from 'lucide-react'
import type { SalesMetrics, PlanType } from '@/lib/billzo/report-engine'
import { formatINR, exportToCSV } from '@/lib/billzo/report-engine'
import { PaywallTeaser } from './MetricCard'

const money = (n: number) => formatINR(n)

interface SalesTabProps {
  metrics: SalesMetrics
  plan: PlanType
}

export function SalesTab({ metrics, plan }: SalesTabProps) {
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
        onClick={handleExport}
        className="flex w-full items-center justify-center gap-2 rounded-xl border py-3 text-sm font-medium"
      >
        <Download className="h-4 w-4" />
        Export to CSV
      </button>
    </div>
  )
}