'use client'

import { useRouter } from 'next/navigation'
import { Download, CheckCircle2, Zap } from 'lucide-react'
import type { AgingBucket, PlanType } from '@/lib/billzo/report-engine'
import { formatINR, exportToCSV } from '@/lib/billzo/report-engine'
import { PaywallTeaser } from './MetricCard'

const money = (n: number) => formatINR(n)

interface AgingTabProps {
  buckets: AgingBucket[]
  plan: PlanType
}

export function AgingTab({ buckets, plan }: AgingTabProps) {
  const router = useRouter()
  const totalPending = buckets.reduce((s, b) => s + b.amount, 0)
  const totalCount = buckets.reduce((s, b) => s + b.count, 0)

  const urgencyBucket = buckets.find(b => b.count > 0)

  const handleExport = () => {
    const rows = buckets.flatMap(b => b.invoices.map(inv => ({
      Customer: inv.customerName,
      Phone: inv.customerPhone,
      Amount: inv.amount,
      'Days Overdue': inv.days,
      Status: inv.status,
    })))
    exportToCSV(rows, 'aging-report')
  }

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
        onClick={handleExport}
        className="flex w-full items-center justify-center gap-2 rounded-xl border py-3 text-sm font-medium"
      >
        <Download className="h-4 w-4" />
        Export to CSV
      </button>
    </div>
  )
}