'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { db } from '@/lib/billzo/db'
import {
  computeRecoveryMetrics,
  computeAgingReport,
  computeGSTReport,
  computeSalesMetrics,
  type RecoveryMetrics,
  type AgingBucket,
  type GSTReport,
  type SalesMetrics,
  type PlanType,
} from '@/lib/billzo/report-engine'

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
  reload: () => void
}

export function useReportsData(): UseReportsDataReturn {
  const router = useRouter()
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

  const loadData = useCallback(async () => {
    try {
      const tenantId = localStorage.getItem('tenantId')
      const userId = localStorage.getItem('userId')
      if (!tenantId || !userId) {
        router.push('/login')
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

  const recovery = useMemo<RecoveryMetrics | null>(() => {
    if (data.loading || data.invoices.length === 0) return null
    return computeRecoveryMetrics(data.payments, data.invoices, data.whatsappEvents, data.plan)
  }, [data])

  const aging = useMemo<AgingBucket[]>(() => {
    if (data.loading || data.invoices.length === 0) return []
    return computeAgingReport(data.invoices, data.plan)
  }, [data])

  const gst = useMemo<GSTReport>(() => {
    if (data.loading || data.invoices.length === 0) {
      return { totalSales: 0, outputGST: 0, inputGST: 0, netGST: 0, cgst: 0, sgst: 0, invoiceCount: 0, hsnBreakdown: [], taxableAmount: 0 }
    }
    return computeGSTReport(data.invoices, data.invoiceItems, data.purchases)
  }, [data])

  const sales = useMemo<SalesMetrics>(() => {
    if (data.loading || data.invoices.length === 0) {
      return { thisMonth: 0, lastMonth: 0, trend: 0, topCustomers: [], topProducts: [], invoiceCount: 0, avgInvoiceValue: 0 }
    }
    return computeSalesMetrics(data.invoices, [], [], data.plan)
  }, [data])

  return {
    ...data,
    recovery,
    aging,
    gst,
    sales,
    reload: loadData,
  }
}