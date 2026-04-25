'use client'

import { useEffect, useState } from 'react'
import { DollarSign, FileText, Clock } from 'lucide-react'
import { dashboardCardInteractive, dashboardCardStatic } from './styles'

export function TodaySnapshot() {
  const [data, setData] = useState<{
    revenue_today: number
    invoice_count_today: number
    pending_sync_count: number
    failed_sync_count: number
    loading: boolean
  }>({
    revenue_today: 0,
    invoice_count_today: 0,
    pending_sync_count: 0,
    failed_sync_count: 0,
    loading: true
  })

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch('/api/dashboard/today-summary')
        if (res.ok) {
          const json = await res.json()
          setData({
            revenue_today: json.revenue_today || 0,
            invoice_count_today: json.invoice_count_today || 0,
            pending_sync_count: json.pending_sync_count || 0,
            failed_sync_count: json.failed_sync_count || 0,
            loading: false
          })
        }
      } catch {
        setData(prev => ({ ...prev, loading: false }))
      }
    }
    fetchData()
  }, [])

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amount)
  }

  if (data.loading) {
    return (
      <div className="grid grid-cols-2 gap-3">
        <div className={`${dashboardCardStatic} animate-pulse`}>
          <div className="h-3 w-16 bg-slate-800 rounded mb-2" />
          <div className="h-8 w-24 bg-slate-800 rounded" />
        </div>
        <div className={`${dashboardCardStatic} animate-pulse`}>
          <div className="h-3 w-20 bg-slate-800 rounded mb-2" />
          <div className="h-8 w-16 bg-slate-800 rounded" />
        </div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className={dashboardCardInteractive}>
        <div className="flex items-center gap-2 text-slate-400 mb-1.5">
          <DollarSign className="w-3.5 h-3.5" />
          <span className="text-[11px] font-semibold uppercase tracking-wide">Revenue</span>
        </div>
        <p className="text-xl sm:text-2xl font-semibold text-white tracking-tight">
          {formatCurrency(data.revenue_today)}
        </p>
        <p className="mt-1 text-[11px] text-slate-500">Collected today</p>
      </div>

      <div className={dashboardCardInteractive}>
        <div className="flex items-center gap-2 text-slate-400 mb-1.5">
          <FileText className="w-3.5 h-3.5" />
          <span className="text-[11px] font-semibold uppercase tracking-wide">Invoices</span>
        </div>
        <p className="text-2xl font-semibold text-white tracking-tight">
          {data.invoice_count_today}
        </p>
        <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">
          <Clock className="h-3 w-3" />
          <span>{data.pending_sync_count} pending sync</span>
        </div>
      </div>
    </div>
  )
}