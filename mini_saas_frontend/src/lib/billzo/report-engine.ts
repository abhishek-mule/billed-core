'use client'

import type { Invoice, Payment, WhatsAppEvent, RecoveryAttempt, InvoiceItem, Product, Customer } from './types'

export type PlanType = 'starter' | 'pro' | 'growth'

export interface RecoveryMetrics {
  totalRecovered: number
  thisMonthRecovered: number
  lastMonthRecovered: number
  trend: number
  autoRecovered: number
  manualRecovered: number
  pendingAmount: number
  invoicesRecovered: number
  invoicesPending: number
  avgRecoveryDays: number
  pendingBreakdown: PendingInvoice[]
  roiMultiple: number
}

export interface PendingInvoice {
  id: string
  customerName: string
  customerPhone: string
  amount: number
  days: number
  status: 'unpaid' | 'partial' | 'overdue'
  lastReminderAt?: string
}

export interface AgingBucket {
  label: string
  minDays: number
  maxDays: number
  count: number
  amount: number
  color: string
  invoices: PendingInvoice[]
}

export interface GSTReport {
  totalSales: number
  outputGST: number
  inputGST: number
  netGST: number
  cgst: number
  sgst: number
  invoiceCount: number
  hsnBreakdown: HSNItem[]
  taxableAmount: number
}

export interface HSNItem {
  hsn: string
  description: string
  qty: number
  taxableValue: number
  rate: number
  cgst: number
  sgst: number
  igst: number
  total: number
}

export interface SalesMetrics {
  thisMonth: number
  lastMonth: number
  trend: number
  topCustomers: CustomerSales[]
  topProducts: ProductSales[]
  invoiceCount: number
  avgInvoiceValue: number
  weeklyBreakdown: WeeklyData[]
  dateRangeLabel: string
}

export interface WeeklyData {
  week: string
  sales: number
  count: number
}

export interface DateRange {
  start: string
  end: string
}

export interface CustomerSales {
  name: string
  phone: string
  totalAmount: number
  invoiceCount: number
}

export interface ProductSales {
  name: string
  qty: number
  revenue: number
}

function daysAgo(dateStr: string): number {
  const date = new Date(dateStr)
  const now = new Date()
  return Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
}

function getMonthRange(offset: number = 0): { start: string; end: string } {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth() - offset, 1)
  const end = new Date(now.getFullYear(), now.getMonth() - offset + 1, 0)
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  }
}

export function isInDateRange(dateStr: string, start: string, end: string): boolean {
  const d = dateStr.slice(0, 10)
  return d >= start && d <= end
}

export function buildWeeklyBreakdown(invoices: Invoice[]): WeeklyData[] {
  const weeks: WeeklyData[] = []
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  for (let i = 0; i < 4; i++) {
    const wStart = new Date(monthStart.getTime() + i * 7 * 24 * 60 * 60 * 1000)
    const wEnd = new Date(monthStart.getTime() + (i + 1) * 7 * 24 * 60 * 60 * 1000 - 1)
    const weekInvoices = invoices.filter(inv => {
      const d = new Date(inv.createdAt)
      return d >= wStart && d <= wEnd
    })
    weeks.push({
      week: `Week ${i + 1}`,
      sales: weekInvoices.reduce((s, inv) => s + inv.total, 0),
      count: weekInvoices.length,
    })
  }
  return weeks
}

export function computeRecoveryMetrics(
  payments: Payment[],
  invoices: Invoice[],
  whatsappEvents: WhatsAppEvent[],
  plan: PlanType = 'starter'
): RecoveryMetrics {
  const thisMonth = getMonthRange(0)
  const lastMonth = getMonthRange(1)

  const successfulPayments = payments.filter(p => p.status === 'success')

  const totalRecovered = successfulPayments.reduce((s, p) => s + p.amount, 0)

  const thisMonthPayments = successfulPayments.filter(p => isInDateRange(p.createdAt, thisMonth.start, thisMonth.end))
  const lastMonthPayments = successfulPayments.filter(p => isInDateRange(p.createdAt, lastMonth.start, lastMonth.end))

  const thisMonthRecovered = thisMonthPayments.reduce((s, p) => s + p.amount, 0)
  const lastMonthRecovered = lastMonthPayments.reduce((s, p) => s + p.amount, 0)

  const trend = lastMonthRecovered > 0
    ? Math.round(((thisMonthRecovered - lastMonthRecovered) / lastMonthRecovered) * 100)
    : thisMonthRecovered > 0 ? 100 : 0

  const unpaidInvoices = invoices.filter(i => i.status !== 'paid')
  const paidInvoices = invoices.filter(i => i.status === 'paid')

  const pendingAmount = unpaidInvoices.reduce((s, i) => s + i.total - i.paidAmount, 0)

  const autoRecovered = 0
  const manualRecovered = thisMonthRecovered

  const recoveryDays = paidInvoices.map(inv => {
    const created = new Date(inv.createdAt).getTime()
    const paid = inv.updatedAt ? new Date(inv.updatedAt).getTime() : Date.now()
    return Math.max(0, Math.round((paid - created) / (1000 * 60 * 60 * 24)))
  })
  const avgRecoveryDays = recoveryDays.length > 0
    ? Math.round(recoveryDays.reduce((s, d) => s + d, 0) / recoveryDays.length)
    : 0

  const roiMultiple = 299 > 0 ? Math.round(totalRecovered / 299) : 0

  const pendingBreakdown: PendingInvoice[] = unpaidInvoices.map(inv => ({
    id: inv.id,
    customerName: inv.customerName,
    customerPhone: inv.customerPhone,
    amount: inv.total - inv.paidAmount,
    days: daysAgo(inv.dueAt),
    status: inv.status as 'unpaid' | 'partial' | 'overdue',
    lastReminderAt: whatsappEvents.find(e => e.invoiceId === inv.id)?.occurredAt,
  }))

  const historyLimit = plan === 'starter' ? 30 : Infinity

  return {
    totalRecovered,
    thisMonthRecovered,
    lastMonthRecovered,
    trend,
    autoRecovered,
    manualRecovered,
    pendingAmount,
    invoicesRecovered: paidInvoices.length,
    invoicesPending: unpaidInvoices.length,
    avgRecoveryDays,
    pendingBreakdown,
    roiMultiple,
  }
}

export function computeAgingReport(
  invoices: Invoice[],
  _plan: PlanType = 'starter'
): AgingBucket[] {
  const unpaidInvoices = invoices.filter(i => i.status !== 'paid')

  const buckets: AgingBucket[] = [
    { label: '0-7 days', minDays: 0, maxDays: 7, count: 0, amount: 0, color: 'text-green-600 bg-green-50', invoices: [] },
    { label: '8-30 days', minDays: 8, maxDays: 30, count: 0, amount: 0, color: 'text-yellow-600 bg-yellow-50', invoices: [] },
    { label: '31-60 days', minDays: 31, maxDays: 60, count: 0, amount: 0, color: 'text-orange-600 bg-orange-50', invoices: [] },
    { label: '60+ days', minDays: 61, maxDays: Infinity, count: 0, amount: 0, color: 'text-red-600 bg-red-50', invoices: [] },
  ]

  for (const inv of unpaidInvoices) {
    const d = daysAgo(inv.dueAt)
    const pending: PendingInvoice = {
      id: inv.id,
      customerName: inv.customerName,
      customerPhone: inv.customerPhone,
      amount: inv.total - inv.paidAmount,
      days: d,
      status: inv.status as 'unpaid' | 'partial' | 'overdue',
    }

    const bucket = buckets.find(b => d >= b.minDays && d <= b.maxDays)
    if (bucket) {
      bucket.count++
      bucket.amount += pending.amount
      bucket.invoices.push(pending)
    }
  }

  return buckets
}

export function computeGSTReport(
  invoices: Invoice[],
  invoiceItems: InvoiceItem[],
  purchases: { amount: number; createdAt: string }[] = []
): GSTReport {
  const thisMonth = getMonthRange(0)
  const monthInvoices = invoices.filter(inv => isInDateRange(inv.createdAt, thisMonth.start, thisMonth.end))

  const totalSales = monthInvoices.reduce((s, inv) => s + inv.total, 0)

  const items = invoiceItems.filter(item => monthInvoices.some(inv => inv.id === item.invoiceId))

  let outputGST = 0
  let taxableAmount = 0
  const hsnMap = new Map<string, HSNItem>()

  for (const item of items) {
    const igst = item.gstRate <= 0 || item.gstRate === 18
    const rate = item.gstRate / 100
    const itemGST = item.lineTotal * rate / (1 + rate)
    const taxable = item.lineTotal - itemGST

    outputGST += itemGST
    taxableAmount += taxable

    const hsn = item.hsn || 'N/A'
    if (!hsnMap.has(hsn)) {
      hsnMap.set(hsn, {
        hsn,
        description: item.name,
        qty: 0,
        taxableValue: 0,
        rate: item.gstRate,
        cgst: 0,
        sgst: 0,
        igst: 0,
        total: 0,
      })
    }
    const hsnItem = hsnMap.get(hsn)!
    hsnItem.qty += item.qty
    hsnItem.taxableValue += taxable
    hsnItem.total += item.lineTotal
    if (igst) {
      hsnItem.igst += itemGST
    } else {
      hsnItem.cgst += itemGST / 2
      hsnItem.sgst += itemGST / 2
    }
  }

  const inputGST = purchases.reduce((s, p) => s + p.amount * 0.18, 0)
  const cgst = outputGST / 2
  const sgst = outputGST / 2
  const netGST = Math.max(0, outputGST - inputGST)

  return {
    totalSales,
    outputGST: Math.round(outputGST * 100) / 100,
    inputGST: Math.round(inputGST * 100) / 100,
    netGST: Math.round(netGST * 100) / 100,
    cgst: Math.round(cgst * 100) / 100,
    sgst: Math.round(sgst * 100) / 100,
    invoiceCount: monthInvoices.length,
    hsnBreakdown: Array.from(hsnMap.values()),
    taxableAmount: Math.round(taxableAmount * 100) / 100,
  }
}

export function computeSalesMetrics(
  invoices: Invoice[],
  _products: Product[] = [],
  _customers: Customer[] = [],
  _plan: PlanType = 'starter'
): SalesMetrics {
  const thisMonth = getMonthRange(0)
  const lastMonth = getMonthRange(1)

  const thisMonthInvoices = invoices.filter(inv => isInDateRange(inv.createdAt, thisMonth.start, thisMonth.end))
  const lastMonthInvoices = invoices.filter(inv => isInDateRange(inv.createdAt, lastMonth.start, lastMonth.end))

  const thisMonthTotal = thisMonthInvoices.reduce((s, inv) => s + inv.total, 0)
  const lastMonthTotal = lastMonthInvoices.reduce((s, inv) => s + inv.total, 0)

  const trend = lastMonthTotal > 0
    ? Math.round(((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 100)
    : thisMonthTotal > 0 ? 100 : 0

  const customerMap = new Map<string, { name: string; phone: string; total: number; count: number }>()
  for (const inv of thisMonthInvoices) {
    const key = inv.customerPhone || inv.customerName
    if (!customerMap.has(key)) {
      customerMap.set(key, { name: inv.customerName, phone: inv.customerPhone, total: 0, count: 0 })
    }
    const entry = customerMap.get(key)!
    entry.total += inv.total
    entry.count++
  }
  const topCustomers = Array.from(customerMap.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, 5)
    .map(c => ({ name: c.name, phone: c.phone, totalAmount: c.total, invoiceCount: c.count }))

  const productMap = new Map<string, { name: string; qty: number; revenue: number }>()
  for (const inv of thisMonthInvoices) {
    const items = (inv as any).items || []
    for (const item of items) {
      if (!productMap.has(item.name)) {
        productMap.set(item.name, { name: item.name, qty: 0, revenue: 0 })
      }
      const p = productMap.get(item.name)!
      p.qty += item.qty || 0
      p.revenue += item.lineTotal || 0
    }
  }
  const topProducts = Array.from(productMap.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5)

  const weeklyBreakdown = buildWeeklyBreakdown(thisMonthInvoices)

  return {
    thisMonth: thisMonthTotal,
    lastMonth: lastMonthTotal,
    trend,
    topCustomers,
    topProducts,
    invoiceCount: thisMonthInvoices.length,
    avgInvoiceValue: thisMonthInvoices.length > 0 ? Math.round(thisMonthTotal / thisMonthInvoices.length) : 0,
    weeklyBreakdown,
    dateRangeLabel: 'This Month',
  }
}

export function buildRangeBreakdown(invoices: Invoice[], range: DateRange): WeeklyData[] {
  const start = new Date(range.start)
  const end = new Date(range.end)
  const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))

  if (totalDays <= 31) {
    return buildWeeklyBreakdown(invoices)
  }

  const numPeriods = Math.min(6, Math.ceil(totalDays / 7))
  const periodDays = Math.ceil(totalDays / numPeriods)
  const labels: string[] = totalDays <= 90
    ? Array.from({ length: numPeriods }, (_, i) => `Week ${i + 1}`)
    : Array.from({ length: numPeriods }, (_, i) => {
        const pStart = new Date(start.getTime() + i * periodDays * 24 * 60 * 60 * 1000)
        return pStart.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
      })

  return Array.from({ length: numPeriods }, (_, i) => {
    const pStart = new Date(start.getTime() + i * periodDays * 24 * 60 * 60 * 1000)
    const pEnd = new Date(start.getTime() + (i + 1) * periodDays * 24 * 60 * 60 * 1000 - 1)
    const periodInvoices = invoices.filter(inv => {
      const d = new Date(inv.createdAt)
      return d >= pStart && d <= pEnd
    })
    return {
      week: labels[i],
      sales: periodInvoices.reduce((s, inv) => s + inv.total, 0),
      count: periodInvoices.length,
    }
  })
}

export function computeSalesMetricsForRange(
  invoices: Invoice[],
  range: DateRange,
  dateRangeLabel: string = ''
): SalesMetrics {
  const rangeInvoices = invoices.filter(inv => isInDateRange(inv.createdAt, range.start, range.end))
  const total = rangeInvoices.reduce((s, inv) => s + inv.total, 0)

  const rangeMs = new Date(range.end).getTime() - new Date(range.start).getTime()
  const prevStart = new Date(new Date(range.start).getTime() - rangeMs - 24 * 60 * 60 * 1000)
  const prevEnd = new Date(new Date(range.start).getTime() - 24 * 60 * 60 * 1000)
  const prevRange = { start: prevStart.toISOString().slice(0, 10), end: prevEnd.toISOString().slice(0, 10) }
  const prevInvoices = invoices.filter(inv => isInDateRange(inv.createdAt, prevRange.start, prevRange.end))
  const prevTotal = prevInvoices.reduce((s, inv) => s + inv.total, 0)

  const trend = prevTotal > 0
    ? Math.round(((total - prevTotal) / prevTotal) * 100)
    : total > 0 ? 100 : 0

  const customerMap = new Map<string, { name: string; phone: string; total: number; count: number }>()
  for (const inv of rangeInvoices) {
    const key = inv.customerPhone || inv.customerName
    if (!customerMap.has(key)) {
      customerMap.set(key, { name: inv.customerName, phone: inv.customerPhone, total: 0, count: 0 })
    }
    const entry = customerMap.get(key)!
    entry.total += inv.total
    entry.count++
  }
  const topCustomers = Array.from(customerMap.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, 5)
    .map(c => ({ name: c.name, phone: c.phone, totalAmount: c.total, invoiceCount: c.count }))

  const productMap = new Map<string, { name: string; qty: number; revenue: number }>()
  for (const inv of rangeInvoices) {
    const items = (inv as any).items || []
    for (const item of items) {
      if (!productMap.has(item.name)) {
        productMap.set(item.name, { name: item.name, qty: 0, revenue: 0 })
      }
      const p = productMap.get(item.name)!
      p.qty += item.qty || 0
      p.revenue += item.lineTotal || 0
    }
  }
  const topProducts = Array.from(productMap.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5)

  const weeklyBreakdown = buildRangeBreakdown(rangeInvoices, range)

  return {
    thisMonth: total,
    lastMonth: prevTotal,
    trend,
    topCustomers,
    topProducts,
    invoiceCount: rangeInvoices.length,
    avgInvoiceValue: rangeInvoices.length > 0 ? Math.round(total / rangeInvoices.length) : 0,
    weeklyBreakdown,
    dateRangeLabel,
  }
}

export function exportToCSV(data: Record<string, unknown>[], filename: string) {
  if (data.length === 0) return
  const headers = Object.keys(data[0])
  const rows = data.map(row =>
    headers.map(h => {
      const val = row[h]
      if (typeof val === 'string' && (val.includes(',') || val.includes('"') || val.includes('\n'))) {
        return `"${val.replace(/"/g, '""')}"`
      }
      return String(val ?? '')
    }).join(',')
  )
  const csv = [headers.join(','), ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function formatINR(n: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n)
}