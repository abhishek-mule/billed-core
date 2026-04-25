'use client'

import { useEffect, useState } from 'react'
import { TrendingUp, Users, AlertCircle, FileCheck, ArrowUpRight } from 'lucide-react'

export function DashboardStats() {
  const [data, setData] = useState({
    revenue_today: 84500,
    revenue_change: 12,
    pending_amount: 112400,
    pending_customers: 14,
    unsynced_count: 2,
    gst_readiness: 98,
    missing_hsn: 3,
    loading: true
  })

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch('/api/dashboard/today-summary')
        if (res.ok) {
          const json = await res.json()
          setData(prev => ({
            ...prev,
            revenue_today: json.revenue_today || 0,
            unsynced_count: json.pending_sync_count || 0,
            loading: false
          }))
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

  const stats = [
    {
      label: "Today's Sales",
      value: formatCurrency(data.revenue_today),
      subtext: `+${data.revenue_change}% from yesterday`,
      icon: TrendingUp,
      color: "text-emerald-500",
      bg: "bg-emerald-50",
      trend: "up"
    },
    {
      label: "Pending Collections",
      value: formatCurrency(data.pending_amount),
      subtext: `Across ${data.pending_customers} customers`,
      icon: Users,
      color: "text-rose-500",
      bg: "bg-rose-50",
    },
    {
      label: "Unsynced Actions",
      value: data.unsynced_count.toString(),
      subtext: "Auto-retrying in background",
      icon: AlertCircle,
      color: "text-amber-500",
      bg: "bg-amber-50",
    },
    {
      label: "GST Readiness",
      value: `${data.gst_readiness}%`,
      subtext: `${data.missing_hsn} invoices missing HSN codes`,
      icon: FileCheck,
      color: "text-indigo-500",
      bg: "bg-indigo-50",
    }
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat, i) => (
        <div key={i} className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition-shadow cursor-pointer group">
          <div className="flex justify-between items-start mb-4">
            <div className={`p-3 rounded-xl ${stat.bg} ${stat.color} transition-colors group-hover:scale-110 duration-300`}>
              <stat.icon className="w-6 h-6" />
            </div>
            {stat.trend === 'up' && (
               <div className="flex items-center gap-1 text-emerald-500 bg-emerald-50 px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest">
                 <ArrowUpRight className="w-3 h-3" />
                 Growth
               </div>
            )}
          </div>
          
          <div className="flex flex-col">
            <span className="text-gray-500 text-sm font-medium mb-1">{stat.label}</span>
            <span className="text-2xl font-black text-gray-900 tracking-tight mb-2">
              {stat.value}
            </span>
            <div className="flex items-center gap-1.5">
              <span className={`text-xs font-bold ${stat.color}`}>
                {stat.subtext}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
