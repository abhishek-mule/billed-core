'use client'

import { useState, useEffect } from 'react'

interface ObservabilityData {
  timestamp: string
  metrics: {
    totalInvoices: number
    invoicesLast30d: number
    failedSyncs: number
    totalCustomers: number
    averageLatencyMs: number
  }
  erpStatus: {
    circuitOpen: boolean
    recentFailures: number
  }
  alerts: string[]
}

export default function ObservabilityWidget() {
  const [data, setData] = useState<ObservabilityData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch('/api/merchant/observability')
        if (res.ok) {
          const json = await res.json()
          setData(json)
        }
      } catch (error) {
        console.error('Failed to load observability:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <div className="bg-[#16161a] rounded-xl p-4 border border-white/5">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-white/10 rounded w-1/3" />
          <div className="h-8 bg-white/10 rounded" />
        </div>
      </div>
    )
  }

  if (!data) return null

  const { metrics, erpStatus, alerts } = data

  return (
    <div className="bg-[#16161a] rounded-xl p-4 border border-white/5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-400">System Status</h3>
        <span className={`w-2 h-2 rounded-full ${
          erpStatus.circuitOpen ? 'bg-red-500' : 'bg-green-500'
        }`} />
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-gray-500 text-xs">Total Invoices</p>
          <p className="text-lg font-semibold">{metrics.totalInvoices}</p>
        </div>
        <div>
          <p className="text-gray-500 text-xs">Last 30 days</p>
          <p className="text-lg font-semibold">{metrics.invoicesLast30d}</p>
        </div>
        <div>
          <p className="text-gray-500 text-xs">Avg Latency</p>
          <p className="text-lg font-semibold">{metrics.averageLatencyMs}ms</p>
        </div>
        <div>
          <p className="text-gray-500 text-xs">Failed Syncs</p>
          <p className={`text-lg font-semibold ${
            metrics.failedSyncs > 0 ? 'text-red-400' : 'text-green-400'
          }`}>
            {metrics.failedSyncs}
          </p>
        </div>
      </div>

      {alerts.length > 0 && (
        <div className="space-y-1">
          {alerts.map((alert, i) => (
            <p key={i} className="text-xs text-amber-400 bg-amber-500/10 px-2 py-1 rounded">
              {alert}
            </p>
          ))}
        </div>
      )}

      <p className="text-[10px] text-gray-600">
        Last updated: {new Date(data.timestamp).toLocaleTimeString()}
      </p>
    </div>
  )
}