'use client'

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Download, Loader2 } from "lucide-react"
import { TrendingUp, Clock, FileText, DollarSign } from "lucide-react"
import { DateRangePicker } from "@/components/reports/DateRangePicker"
import { useReportsData } from "@/components/reports/useReportsData"
import { RecoveryTab } from "@/components/reports/RecoveryTab"
import { AgingTab } from "@/components/reports/AgingTab"
import { GSTTab } from "@/components/reports/GSTTab"
import { SalesTab } from "@/components/reports/SalesTab"

type Tab = 'recovery' | 'aging' | 'gst' | 'sales'

export default function ReportsPage() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('recovery')

  useEffect(() => {
    const userId = (() => {
      function getCookie(name: string) {
        if (typeof document === 'undefined') return null
        const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
        return match ? match[2] : null
      }
      const token = getCookie('bz_access')
      if (!token) return null
      try { return JSON.parse(atob(token.split('.')[1])).userId || null } catch { return null }
    })()
    if (!userId) router.push("/auth")
  }, [router])

  const { loading, error, recovery, aging, gst, sales, plan, dateRange, setDateRange } = useReportsData()

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

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-sm text-red-500">Failed to load reports: {error}</p>
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
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="text-sm text-muted-foreground">Track your recovery performance</p>
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

      {tab === 'recovery' && recovery && (
        <RecoveryTab recovery={recovery} plan={plan} />
      )}
      {tab === 'aging' && (
        <AgingTab buckets={aging} plan={plan} />
      )}
      {tab === 'gst' && (
        <GSTTab report={gst} />
      )}
      {tab === 'sales' && (
        <SalesTab metrics={sales} plan={plan} />
      )}
    </div>
  )
}