'use client'

import { useRouter } from 'next/navigation'
import { TrendingUp, TrendingDown, Send, AlertCircle, CheckCircle2 } from 'lucide-react'
import type { RecoveryMetrics, PlanType } from '@/lib/billzo/report-engine'
import { formatINR } from '@/lib/billzo/report-engine'
import { PaywallTeaser } from './MetricCard'

const money = (n: number) => formatINR(n)

interface RecoveryTabProps {
  recovery: RecoveryMetrics
  plan: PlanType
}

export function RecoveryTab({ recovery, plan }: RecoveryTabProps) {
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
                        const { db: dbFn } = await import('@/lib/billzo/db')
                        const invoice = await dbFn().invoices.get(inv.id)
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

function MetricCard({ label, value, sub, icon }: { label: string; value: string; sub?: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-2xl font-black">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  )
}