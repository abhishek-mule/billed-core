'use client'

import { useRouter } from 'next/navigation'
import { TrendingUp, TrendingDown, Send, AlertCircle, CheckCircle2, PieChart as PieIcon } from 'lucide-react'
import type { RecoveryMetrics, PlanType } from '@/lib/billzo/report-engine'
import { formatINR } from '@/lib/utils'
import { PaywallTeaser } from './MetricCard'
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend
} from 'recharts'

const money = (n: number) => formatINR(n)

interface RecoveryTabProps {
  recovery: RecoveryMetrics
  plan: PlanType
}

export function RecoveryTab({ recovery, plan }: RecoveryTabProps) {
  const router = useRouter()
  const roiMultiple = recovery.totalRecovered / 299

  const pieData = [
    { name: 'Paid', value: recovery.invoicesRecovered, color: '#10b981' },
    { name: 'Pending', value: recovery.invoicesPending, color: '#f59e0b' },
  ]

  const hasData = !!(recovery.invoicesRecovered > 0 || recovery.invoicesPending > 0 || recovery.totalRecovered > 0 || recovery.pendingAmount > 0 || recovery.pendingBreakdown.length > 0)

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <PaywallTeaser plan={plan} />

      {hasData ? (
        <>
          {/* Recovery Hero Card */}
          <div className="rounded-2xl bg-foreground text-background p-8 shadow-xl dark:shadow-[0_8px_32px_rgba(0,0,0,0.45)] relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 blur-[80px] -mr-20 -mt-20"></div>
            <div className="relative z-10">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Total Recovery Volume</p>
                  <p className="mt-2 text-5xl font-black">{money(recovery.totalRecovered)}</p>
                  {roiMultiple >= 1 && (
                    <div className="mt-4 inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/20 text-emerald-400 rounded-full text-xs font-bold border border-emerald-500/20">
                      <TrendingUp className="h-3 w-3" />
                      {Math.floor(roiMultiple)}x Return on Investment
                    </div>
                  )}
                </div>
                <div className="grid h-14 w-14 place-items-center rounded-2xl bg-background/5 border border-background/10 backdrop-blur-sm">
                  <PieIcon className="h-7 w-7 text-primary" />
                </div>
              </div>

              <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
                {[
                  { label: 'This Month', val: money(recovery.thisMonthRecovered) },
                  { label: 'Growth', val: `${recovery.trend}%`, icon: recovery.trend >= 0 ? TrendingUp : TrendingDown },
                  { label: 'Avg Time', val: `${recovery.avgRecoveryDays} days` },
                  { label: 'Invoices', val: recovery.invoicesRecovered },
                ].map((stat, idx) => (
                  <div key={idx} className="p-4 rounded-2xl bg-background/5 border border-background/5">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{stat.label}</p>
                    <p className="mt-1 text-lg font-bold flex items-center gap-1">
                      {stat.icon && <stat.icon className="h-4 w-4" />}
                      {stat.val}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid lg:grid-cols-[1fr_350px] gap-5">
            {/* Pending Breakdown */}
            <div className="rounded-2xl border bg-card p-6 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="font-bold text-lg">Money on the Table</h3>
                  <p className="text-xs text-muted-foreground">Unpaid invoices that need attention</p>
                </div>
                <button
                  onClick={() => router.push('/dashboard')}
                  className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground transition-colors hover:opacity-90"
                >
                  <Send className="h-3 w-3" />
                  Recover Now
                </button>
              </div>

              <div className="space-y-3">
                {recovery.pendingBreakdown.length > 0 ? (
                  recovery.pendingBreakdown.slice(0, 5).map(inv => (
                    <div key={inv.id} className="flex items-center justify-between rounded-xl border border-border p-4 transition-all hover:border-primary/20 hover:bg-primary/5">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground font-bold text-xs">
                          {inv.customerName.charAt(0)}
                        </div>
                        <div>
                          <p className="font-bold text-foreground">{inv.customerName}</p>
                          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-tight">
                            {inv.days} days overdue · {inv.status}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-black text-foreground">{money(inv.amount)}</p>
                        {plan !== 'starter' && (
                          <p className="cursor-pointer text-[10px] font-bold text-primary hover:underline">Push Reminder</p>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-10 text-center">
                    <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto opacity-20" />
                    <p className="mt-2 text-sm font-medium text-muted-foreground">Zero pending invoices!</p>
                  </div>
                )}
              </div>
            </div>

            {/* Chart Card */}
            <div className="rounded-2xl border bg-card p-6 shadow-sm flex flex-col">
              <h3 className="font-bold text-lg mb-1">Status Mix</h3>
              <p className="text-xs text-muted-foreground mb-6">Paid vs Pending ratio</p>

              <div className="flex-1 min-h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend verticalAlign="bottom" height={36}/>
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="mt-4 p-4 rounded-xl bg-muted border border-border">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-muted-foreground uppercase tracking-tighter">Conversion</span>
                  <span className="font-black text-foreground">
                    {recovery.invoicesRecovered + recovery.invoicesPending > 0
                      ? `${Math.round((recovery.invoicesRecovered / (recovery.invoicesRecovered + recovery.invoicesPending)) * 100)}%`
                      : '0%'}
                  </span>
                </div>
                <div className="mt-2 w-full h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500"
                    style={{ width: `${recovery.invoicesRecovered + recovery.invoicesPending > 0 ? (recovery.invoicesRecovered / (recovery.invoicesRecovered + recovery.invoicesPending)) * 100 : 0}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="rounded-3xl border-2 border-dashed border-border p-12 text-center bg-muted/50">
          <div className="w-20 h-20 bg-card rounded-full border shadow-sm flex items-center justify-center mx-auto">
            <TrendingUp className="h-10 w-10 text-muted-foreground" />
          </div>
          <h3 className="mt-6 font-black text-xl text-foreground">Start Your Recovery Journey</h3>
          <p className="mt-2 text-muted-foreground max-w-xs mx-auto">
            Automate your payment collection and see your cash flow improve instantly.
          </p>
          <button
            onClick={() => router.push('/pos')}
            className="mt-6 rounded-2xl bg-indigo-600 px-8 py-4 text-sm font-black text-white shadow-lg hover:bg-indigo-700 hover:-translate-y-0.5 transition-all active:scale-95"
          >
            Create Your First Invoice
          </button>
        </div>
      )}
    </div>
  )
}