'use client'

import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { db } from '@/lib/billzo/db'
import {
  computeRecoveryMetrics,
  computeAgingReport,
  computeGSTReport,
  computeSalesMetricsForRange,
  isInDateRange,
  type RecoveryMetrics,
  type AgingBucket,
  type GSTReport,
  type SalesMetrics,
  type PlanType,
  type DateRange,
} from '@/lib/billzo/report-engine'

export type { DateRange }

export interface ReportsData {
  invoices: any[]
  invoiceItems: any[]
  payments: any[]
  whatsappEvents: any[]
  purchases: any[]
  plan: PlanType
  totalRecovered: number
  loading: boolean
  error: string | null
}

export interface UseReportsDataReturn extends ReportsData {
  recovery: RecoveryMetrics | null
  aging: AgingBucket[]
  gst: GSTReport
  sales: SalesMetrics
  dateRange: DateRange
  setDateRange: (range: DateRange) => void
  reload: () => void
}

function getCookie(name: string) {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
  return match ? match[2] : null
}

function getDefaultRange(): DateRange {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  return {
    start: start.toISOString().slice(0, 10),
    end: now.toISOString().slice(0, 10),
  }
}

export function getDateRangeOptions(): { label: string; value: string; range: DateRange }[] {
  const now = new Date()
  const thisMonth: DateRange = {
    start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10),
    end: now.toISOString().slice(0, 10),
  }
  const lastMonth: DateRange = {
    start: new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10),
    end: new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10),
  }
  const thisQuarter: DateRange = {
    start: new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1).toISOString().slice(0, 10),
    end: now.toISOString().slice(0, 10),
  }
  const thisYear: DateRange = {
    start: new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10),
    end: now.toISOString().slice(0, 10),
  }
  const last7: DateRange = {
    start: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    end: now.toISOString().slice(0, 10),
  }
  const last30: DateRange = {
    start: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    end: now.toISOString().slice(0, 10),
  }
  return [
    { label: 'This Month', value: 'this_month', range: thisMonth },
    { label: 'Last Month', value: 'last_month', range: lastMonth },
    { label: 'Last 7 Days', value: 'last_7', range: last7 },
    { label: 'Last 30 Days', value: 'last_30', range: last30 },
    { label: 'This Quarter', value: 'this_quarter', range: thisQuarter },
    { label: 'This Year', value: 'this_year', range: thisYear },
  ]
}

export function useReportsData(): UseReportsDataReturn {
  const router = useRouter()
  const [dateRange, setDateRangeState] = useState<DateRange>(getDefaultRange)
  const [data, setData] = useState<ReportsData>({
    invoices: [],
    invoiceItems: [],
    payments: [],
    whatsappEvents: [],
    purchases: [],
    plan: 'starter',
    totalRecovered: 0,
    loading: true,
    error: null,
  })

  const setDateRange = useCallback((range: DateRange) => {
    setDateRangeState(range)
  }, [])

  const loadData = useCallback(async () => {
    try {
      const tenantId = getCookie('bz_tenant')
      const token = getCookie('bz_access')
      let userId: string | null = null
      if (token) {
        try { userId = JSON.parse(atob(token.split('.')[1])).userId || null } catch { userId = null }
      }
      if (!tenantId || !userId) {
        router.push('/auth')
        return
      }

      const [invoices, invoiceItems, payments, whatsappEvents, purchases, tenant] = await Promise.all([
        db().invoices.where('tenantId').equals(tenantId).toArray(),
        db().invoiceItems.where('tenantId').equals(tenantId).toArray(),
        db().payments.where('tenantId').equals(tenantId).toArray(),
        db().whatsappEvents.where('tenantId').equals(tenantId).toArray(),
        db().purchases.where('tenantId').equals(tenantId).toArray(),
        db().tenants.get(tenantId),
      ])

      const totalRecovered = payments
        .filter((p: any) => p.status === 'success')
        .reduce((s: number, p: any) => s + p.amount, 0)

      setData({
        invoices,
        invoiceItems,
        payments,
        whatsappEvents,
        purchases,
        plan: (tenant?.plan as PlanType) || 'starter',
        totalRecovered,
        loading: false,
        error: null,
      })
    } catch (err: any) {
      console.error('Failed to load reports:', err)
      setData(prev => ({ ...prev, loading: false, error: err.message }))
    }
  }, [router])

  useEffect(() => {
    loadData()
  }, [loadData])

  const sales = useMemo<SalesMetrics>(() => {
    if (data.loading || data.invoices.length === 0) {
      return { thisMonth: 0, lastMonth: 0, trend: 0, topCustomers: [], topProducts: [], invoiceCount: 0, avgInvoiceValue: 0, weeklyBreakdown: [], dateRangeLabel: '' }
    }
    const invoicesWithItems = data.invoices.map(inv => ({
      ...inv,
      items: data.invoiceItems.filter(item => item.invoiceId === inv.id),
    }))
    const options = getDateRangeOptions()
    const label = options.find(o => o.range.start === dateRange.start && o.range.end === dateRange.end)?.label || 'Custom'
    return computeSalesMetricsForRange(invoicesWithItems, dateRange, label)
  }, [data.loading, data.invoices.length, data.invoiceItems, dateRange])

  const recovery = useMemo<RecoveryMetrics | null>(() => {
    if (data.loading || data.invoices.length === 0) return null
    return computeRecoveryMetrics(data.payments, data.invoices, data.whatsappEvents, data.plan, dateRange)
  }, [data.loading, data.invoices, data.payments, data.whatsappEvents, data.plan, dateRange])

  const aging = useMemo<AgingBucket[]>(() => {
    if (data.loading || data.invoices.length === 0) return []
    return computeAgingReport(data.invoices, data.plan, dateRange)
  }, [data.loading, data.invoices, data.plan, dateRange])

  const gst = useMemo<GSTReport>(() => {
    if (data.loading || data.invoices.length === 0) {
      return { totalSales: 0, outputGST: 0, inputGST: 0, netGST: 0, cgst: 0, sgst: 0, invoiceCount: 0, hsnBreakdown: [], taxableAmount: 0 }
    }
    return computeGSTReport(data.invoices, data.invoiceItems, data.purchases, dateRange)
  }, [data.loading, data.invoices, data.invoiceItems, data.purchases, dateRange])

  return {
    ...data,
    recovery,
    aging,
    gst,
    sales,
    dateRange,
    setDateRange,
    reload: loadData,
  }
}