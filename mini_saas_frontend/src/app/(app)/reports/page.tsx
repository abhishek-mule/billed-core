'use client'

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { TrendingUp, Clock, FileText, DollarSign, Plus } from "lucide-react"
import { Button } from "@/components/billzo/Button"
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
    <div className="rounded-2xl border-2 border-dashed border-border p-12 text-center bg-muted/30">
      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border bg-card shadow-sm">
        {tab === 'recovery' ? <TrendingUp className="h-10 w-10 text-muted-foreground/40" /> :
         tab === 'aging' ? <Clock className="h-10 w-10 text-muted-foreground/40" /> :
         tab === 'gst' ? <FileText className="h-10 w-10 text-muted-foreground/40" /> :
         <DollarSign className="h-10 w-10 text-muted-foreground/40" />}
      </div>
      <h3 className="mt-6 text-xl font-black text-foreground">{title}</h3>
      <p className="mx-auto mt-2 max-w-xs text-muted-foreground">{desc}</p>
      <Button onClick={() => router.push('/pos')} size="lg" className="mx-auto mt-6 shadow-lg shadow-primary/20">
        <Plus className="h-4 w-4" />
        {action}
      </Button>
    </div>
  )
}

const TabSkeleton = () => (
  <div className="space-y-4 animate-pulse">
    <div className="grid grid-cols-3 gap-3">
      {[0,1,2].map(i => <div key={i} className="h-28 rounded-2xl bg-muted" />)}
    </div>
    <div className="h-64 rounded-2xl bg-muted" />
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
    const userId = getCookie('bz_user_id')
    if (!userId) router.push('/auth')
  }, [router])

  const { loading, error, recovery, aging, gst, sales, plan, dateRange, setDateRange } = useReportsData()

  if (loading) {
    return (
      <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-5xl mx-auto space-y-6">
        <div className="h-16 animate-pulse rounded-2xl bg-muted" />
        <div className="h-10 animate-pulse rounded-xl bg-muted" />
        <TabSkeleton />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center">
          <p className="font-medium text-destructive">{error}</p>
          <Button variant="danger" onClick={() => window.location.reload()} className="mt-3">Retry</Button>
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
            className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
              tab === t.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
            {...(tab === t.id ? { 'aria-current': 'true' as const } : {})}
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
        gst.invoiceCount > 0 ? <GSTTab report={gst} plan={plan} /> : <EmptyState tab={tab} />
      )}
      {tab === 'sales' && (
        sales.invoiceCount > 0 ? <SalesTab metrics={sales} plan={plan} /> : <EmptyState tab={tab} />
      )}
    </div>
  )
}