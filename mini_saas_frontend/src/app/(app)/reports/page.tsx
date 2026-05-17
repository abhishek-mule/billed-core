'use client'

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { TrendingUp, Clock, FileText, DollarSign, Plus } from "lucide-react"
import { DateRangePicker } from "@/components/reports/DateRangePicker"
import { useReportsData } from "@/components/reports/useReportsData"
import { RecoveryTab } from "@/components/reports/RecoveryTab"
import { AgingTab } from "@/components/reports/AgingTab"
import { GSTTab } from "@/components/reports/GSTTab"
import { SalesTab } from "@/components/reports/SalesTab"

type Tab = 'recovery' | 'aging' | 'gst' | 'sales'

const EmptyState = ({ tab }: { tab: Tab }) => {
  const router = useRouter()
  const labels: Record<Tab, { title: string; desc: string; action: string }> = {
    recovery: { title: 'No recovery data yet', desc: 'Create invoices and get paid to see recovery metrics.', action: 'Create Invoice' },
    aging: { title: 'No outstanding invoices', desc: 'Aging report shows unpaid invoices by days overdue.', action: 'Create Invoice' },
    gst: { title: 'No GST data yet', desc: 'Create GST-enabled invoices to see your tax liability.', action: 'Create Invoice' },
    sales: { title: 'No sales data yet', desc: 'Create your first invoice to see sales performance.', action: 'Create Invoice' },
  }
  const { title, desc, action } = labels[tab]
  return (
    <div className="rounded-3xl border-2 border-dashed border-slate-200 p-12 text-center bg-slate-50/50">
      <div className="w-20 h-20 bg-white rounded-full border shadow-sm flex items-center justify-center mx-auto">
        {tab === 'recovery' ? <TrendingUp className="h-10 w-10 text-slate-300" /> :
         tab === 'aging' ? <Clock className="h-10 w-10 text-slate-300" /> :
         tab === 'gst' ? <FileText className="h-10 w-10 text-slate-300" /> :
         <DollarSign className="h-10 w-10 text-slate-300" />}
      </div>
      <h3 className="mt-6 font-black text-xl text-slate-900">{title}</h3>
      <p className="mt-2 text-slate-500 max-w-xs mx-auto">{desc}</p>
      <button
        onClick={() => router.push('/pos')}
        className="mt-6 flex items-center gap-2 mx-auto rounded-2xl bg-indigo-600 px-8 py-4 text-sm font-black text-white shadow-lg shadow-indigo-200 hover:bg-indigo-700 hover:-translate-y-0.5 transition-all active:scale-95"
      >
        <Plus className="h-4 w-4" />
        {action}
      </button>
    </div>
  )
}

const TabSkeleton = () => (
  <div className="space-y-4 animate-pulse">
    <div className="grid grid-cols-3 gap-3">
      {[0,1,2].map(i => <div key={i} className="h-28 rounded-2xl bg-slate-100" />)}
    </div>
    <div className="h-64 rounded-2xl bg-slate-100" />
  </div>
)

export default function ReportsPage() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('recovery')

  useEffect(() => {
    function getCookie(name: string) {
      if (typeof document === 'undefined') return null
      const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
      return match ? match[2] : null
    }
    const token = getCookie('bz_access')
    if (!token) router.push('/auth')
  }, [router])

  const { loading, error, recovery, aging, gst, sales, plan, dateRange, setDateRange } = useReportsData()

  if (loading) {
    return (
      <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-5xl mx-auto space-y-6">
        <div className="h-16 rounded-2xl bg-slate-100 animate-pulse" />
        <div className="h-10 rounded-xl bg-slate-100 animate-pulse" />
        <TabSkeleton />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <p className="text-red-500 font-medium">{error}</p>
          <button onClick={() => window.location.reload()} className="mt-3 px-4 py-2 bg-red-50 text-red-600 rounded-xl text-sm">Retry</button>
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

  const hasAnyData = recovery || aging.length > 0 || gst.invoiceCount > 0 || sales.invoiceCount > 0

  return (
    <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="text-sm text-muted-foreground">
            {hasAnyData ? `Showing: ${dateRange.start} — ${dateRange.end}` : 'Track your business performance'}
          </p>
        </div>
        <DateRangePicker value={dateRange} onChange={setDateRange} />
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

      {tab === 'recovery' && (
        recovery ? <RecoveryTab recovery={recovery} plan={plan} /> : <EmptyState tab={tab} />
      )}
      {tab === 'aging' && (
        aging.length > 0 ? <AgingTab buckets={aging} plan={plan} /> : <EmptyState tab={tab} />
      )}
      {tab === 'gst' && (
        gst.invoiceCount > 0 ? <GSTTab report={gst} /> : <EmptyState tab={tab} />
      )}
      {tab === 'sales' && (
        sales.invoiceCount > 0 ? <SalesTab metrics={sales} plan={plan} /> : <EmptyState tab={tab} />
      )}
    </div>
  )
}