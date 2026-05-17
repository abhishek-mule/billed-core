'use client'

import { useRouter } from 'next/navigation'
import { TrendingUp, TrendingDown, Send, AlertCircle, CheckCircle2, PieChart as PieIcon } from 'lucide-react'
import type { RecoveryMetrics, PlanType } from '@/lib/billzo/report-engine'
import { formatINR } from '@/lib/billzo/report-engine'
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
          <div className="rounded-3xl bg-slate-900 text-white p-8 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 blur-[80px] -mr-20 -mt-20"></div>
            <div className="relative z-10">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Total Recovery Volume</p>
                  <p className="mt-2 text-5xl font-black">{money(recovery.totalRecovered)}</p>
                  {roiMultiple >= 1 && (
                    <div className="mt-4 inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/20 text-emerald-400 rounded-full text-xs font-bold border border-emerald-500/20">
                      <TrendingUp className="h-3 w-3" />
                      {Math.floor(roiMultiple)}x Return on Investment
                    </div>
                  )}
                </div>
                <div className="grid h-14 w-14 place-items-center rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm">
                  <PieIcon className="h-7 w-7 text-indigo-400" />
                </div>
              </div>

              <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
                {[
                  { label: 'This Month', val: money(recovery.thisMonthRecovered) },
                  { label: 'Growth', val: `${recovery.trend}%`, icon: recovery.trend >= 0 ? TrendingUp : TrendingDown },
                  { label: 'Avg Time', val: `${recovery.avgRecoveryDays} days` },
                  { label: 'Invoices', val: recovery.invoicesRecovered },
                ].map((stat, idx) => (
                  <div key={idx} className="p-4 rounded-2xl bg-white/5 border border-white/5">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{stat.label}</p>
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
            <div className="rounded-2xl border bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="font-bold text-lg">Money on the Table</h3>
                  <p className="text-xs text-muted-foreground">Unpaid invoices that need attention</p>
                </div>
                <button
                  onClick={() => router.push('/dashboard')}
                  className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 transition-colors"
                >
                  <Send className="h-3 w-3" />
                  Recover Now
                </button>
              </div>

              <div className="space-y-3">
                {recovery.pendingBreakdown.length > 0 ? (
                  recovery.pendingBreakdown.slice(0, 5).map(inv => (
                    <div key={inv.id} className="flex items-center justify-between rounded-xl border border-slate-100 p-4 hover:border-indigo-200 hover:bg-indigo-50/30 transition-all">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-xs">
                          {inv.customerName.charAt(0)}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900">{inv.customerName}</p>
                          <p className="text-[10px] font-medium text-slate-500 uppercase tracking-tight">
                            {inv.days} days overdue · {inv.status}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-black text-slate-900">{money(inv.amount)}</p>
                        {plan !== 'starter' && (
                          <p className="text-[10px] text-indigo-600 font-bold cursor-pointer hover:underline">Push Reminder</p>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-10 text-center">
                    <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto opacity-20" />
                    <p className="mt-2 text-sm font-medium text-slate-400">Zero pending invoices!</p>
                  </div>
                )}
              </div>
            </div>

            {/* Chart Card */}
            <div className="rounded-2xl border bg-white p-6 shadow-sm flex flex-col">
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

              <div className="mt-4 p-4 rounded-xl bg-slate-50 border border-slate-100">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-500 uppercase tracking-tighter">Conversion</span>
                  <span className="font-black text-slate-900">
                    {recovery.invoicesRecovered + recovery.invoicesPending > 0
                      ? `${Math.round((recovery.invoicesRecovered / (recovery.invoicesRecovered + recovery.invoicesPending)) * 100)}%`
                      : '0%'}
                  </span>
                </div>
                <div className="mt-2 w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
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
        <div className="rounded-3xl border-2 border-dashed border-slate-200 p-12 text-center bg-slate-50/50">
          <div className="w-20 h-20 bg-white rounded-full border shadow-sm flex items-center justify-center mx-auto">
            <TrendingUp className="h-10 w-10 text-slate-300" />
          </div>
          <h3 className="mt-6 font-black text-xl text-slate-900">Start Your Recovery Journey</h3>
          <p className="mt-2 text-slate-500 max-w-xs mx-auto">
            Automate your payment collection and see your cash flow improve instantly.
          </p>
          <button
            onClick={() => router.push('/pos')}
            className="mt-6 rounded-2xl bg-indigo-600 px-8 py-4 text-sm font-black text-white shadow-lg shadow-indigo-200 hover:bg-indigo-700 hover:-translate-y-0.5 transition-all active:scale-95"
          >
            Create Your First Invoice
          </button>
        </div>
      )}
    </div>
  )
}