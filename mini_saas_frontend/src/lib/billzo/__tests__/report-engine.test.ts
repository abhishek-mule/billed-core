import { describe, it, expect } from 'vitest'
import {
  computeSalesMetricsForRange,
  computeRecoveryMetrics,
  computeGSTReport,
  computeAgingReport,
} from '../report-engine'
import type { Invoice, Payment } from '../types'

type PartialInvoice = {
  id: string
  customerId?: string
  customerName?: string
  customerPhone?: string
  total: number
  paidAmount?: number
  status: Invoice['status']
  createdAt: string
  dueAt: string
  updatedAt?: string
  items?: { name: string; qty: number; lineTotal: number; gstRate: number; hsn?: string }[]
}

type PartialPayment = {
  id: string
  invoiceId?: string
  amount: number
  status: Payment['status']
  paidAt?: string
  createdAt: string
}

function invoice(i: PartialInvoice): Invoice {
  return i as unknown as Invoice
}

function payment(p: PartialPayment): Payment {
  return p as unknown as Payment
}

describe('report-engine — previous-period zero sales', () => {
  it('returns lastMonth = 0 (no fabricated 100%/∞%) when previous period has no sales', () => {
    const range = { start: '2026-09-01', end: '2026-09-05' }
    const invoices = [
      invoice({
        id: 'inv-1',
        customerId: '',
        customerPhone: '',
        customerName: 'Walk-in Customer',
        total: 4500,
        paidAmount: 0,
        status: 'paid',
        createdAt: '2026-09-02T10:00:00.000Z',
        dueAt: '2026-09-09T00:00:00.000Z',
      }),
      invoice({
        id: 'inv-2',
        customerId: '',
        customerPhone: '',
        customerName: 'Walk-in Customer',
        total: 1950,
        paidAmount: 0,
        status: 'paid',
        createdAt: '2026-09-03T10:00:00.000Z',
        dueAt: '2026-09-10T00:00:00.000Z',
      }),
    ]

    const s = computeSalesMetricsForRange(invoices, range, 'Custom')

    // Page-derived values (mirrors reports/page.tsx: salesDelta / salesPct):
    const salesDelta = s.thisMonth - s.lastMonth
    const salesPct = s.lastMonth > 0 ? `${s.trend >= 0 ? '+' : ''}${s.trend}%` : null

    expect(s.thisMonth).toBe(6450)
    expect(s.lastMonth).toBe(0)
    expect(s.trend).toBe(100) // legacy field — page must NOT use it when lastMonth === 0
    expect(salesDelta).toBe(6450)
    expect(salesPct).toBeNull() // → UI shows "+₹6,450" + "no previous-period sales"

    // Weekly buckets cover the actual selected range with real labels.
    expect(s.weeklyBreakdown.length).toBeGreaterThan(0)
    for (const w of s.weeklyBreakdown) expect(w.week).toContain('–')
    expect(s.weeklyBreakdown.reduce((sum, w) => sum + w.sales, 0)).toBe(6450)

    // Walk-ins with identical anonymous details aggregate into one customer.
    expect(s.topCustomers.length).toBe(1)
    expect(s.topCustomers[0].name).toBe('Walk-in Customer')
    expect(s.topCustomers[0].invoiceCount).toBe(2)
    expect(s.topCustomers[0].totalAmount).toBe(6450)
  })

  it('numbers distinct anonymous walk-ins instead of merging them into fake identities', () => {
    const range = { start: '2026-09-01', end: '2026-09-05' }
    const invoices = [
      invoice({
        id: 'inv-1',
        customerId: '',
        customerPhone: '9876500001',
        customerName: 'Walk-in Customer',
        total: 4500,
        status: 'paid',
        createdAt: '2026-09-02T10:00:00.000Z',
        dueAt: '2026-09-09T00:00:00.000Z',
      }),
      invoice({
        id: 'inv-2',
        customerId: '',
        customerPhone: '9876500002',
        customerName: 'Walk-in Customer',
        total: 1950,
        status: 'paid',
        createdAt: '2026-09-03T10:00:00.000Z',
        dueAt: '2026-09-10T00:00:00.000Z',
      }),
    ]

    const s = computeSalesMetricsForRange(invoices, range, 'Custom')
    expect(s.topCustomers.length).toBe(2)
    expect(s.topCustomers.map(c => c.name).sort()).toEqual(['Walk-in Customer #1', 'Walk-in Customer #2'])
  })
})

describe('report-engine — no overdue population (zero vs N/A)', () => {
  it('reports no pending and N/A avg recovery when a paid invoice has no payment record', () => {
    const range = { start: '2026-09-01', end: '2026-09-11' }
    const invoices = [
      invoice({
        id: 'inv-paid',
        customerId: 'cus-1',
        customerName: 'Ramesh',
        total: 2000,
        paidAmount: 2000,
        status: 'paid',
        createdAt: '2026-09-02T10:00:00.000Z',
        dueAt: '2026-09-09T00:00:00.000Z',
        updatedAt: '2026-09-10T10:00:00.000Z', // record touched long after payment
      }),
    ]

    const r = computeRecoveryMetrics([], invoices, [], 'starter', range)

    // Page gate: hasOverdue = invoicesPending > 0 → false → "Nothing overdue" panel.
    expect(r.invoicesPending).toBe(0)
    expect(r.pendingAmount).toBe(0)
    // No payment evidence → null → page shows N/A (was: fabricated 0d / Date.now()).
    expect(r.avgRecoveryDays).toBeNull()
  })
})

describe('report-engine — overdue population exists', () => {
  it('computes avg recovery from canonical payment timestamps, not invoice.updatedAt', () => {
    const range = { start: '2026-08-01', end: '2026-09-11' }
    const invoices = [
      invoice({
        id: 'inv-paid',
        customerId: 'cus-1',
        customerName: 'Ramesh',
        total: 500,
        paidAmount: 500,
        status: 'paid',
        createdAt: '2026-08-20T10:00:00.000Z',
        dueAt: '2026-08-25T00:00:00.000Z',
        updatedAt: '2026-09-10T10:00:00.000Z', // would make the old calc 21d
      }),
      invoice({
        id: 'inv-overdue',
        customerId: 'cus-2',
        customerName: 'Suresh',
        total: 1000,
        paidAmount: 0,
        status: 'unpaid',
        createdAt: '2026-08-15T10:00:00.000Z',
        dueAt: '2026-09-05T00:00:00.000Z',
      }),
    ]
    const payments = [
      payment({
        id: 'pay-1',
        invoiceId: 'inv-paid',
        amount: 500,
        status: 'success',
        paidAt: '2026-08-25T10:00:00.000Z', // received 5 days after creation
        createdAt: '2026-08-25T10:00:00.000Z',
      }),
    ]

    const r = computeRecoveryMetrics(payments, invoices, [], 'starter', range)

    expect(r.avgRecoveryDays).toBe(5) // 25 Aug − 20 Aug = 5d (not 21d from updatedAt)
    expect(r.invoicesPending).toBe(1)
    expect(r.pendingAmount).toBe(1000)
    expect(r.thisMonthRecovered).toBe(500)

    // Page-derived recovery rate (mirrors reports/page.tsx):
    const recoveryRate = r.thisMonthRecovered > 0 || r.pendingAmount > 0
      ? Math.round((r.thisMonthRecovered / (r.thisMonthRecovered + r.pendingAmount)) * 100)
      : null
    expect(recoveryRate).toBe(33)

    // Aging sums the same population regardless of bucket placement.
    const aging = computeAgingReport(invoices, 'starter', range)
    expect(aging.length).toBe(4)
    expect(aging.reduce((s, b) => s + b.amount, 0)).toBe(1000)
  })
})

describe('report-engine — GST stays internally correct across rates', () => {
  it('keeps taxable + GST = line total and separates rates/HSN', () => {
    const range = { start: '2026-09-01', end: '2026-09-11' }
    const invoices = [
      invoice({
        id: 'inv-tax',
        customerId: 'cus-1',
        customerName: 'Ramesh',
        total: 6600,
        status: 'paid',
        createdAt: '2026-09-02T10:00:00.000Z',
        dueAt: '2026-09-09T00:00:00.000Z',
        items: [{ name: 'Milk', qty: 1, lineTotal: 6600, gstRate: 18, hsn: '040120' }],
      }),
    ]
    const items = [
      { id: 'item-1', tenantId: 'x', invoiceId: 'inv-tax', name: 'Milk', qty: 1, lineTotal: 6600, gstRate: 18, hsn: '040120' },
    ]

    const g = computeGSTReport(invoices as any, items as any, [], range)

    expect(g.invoiceCount).toBe(1)
    expect(Math.round(g.outputGST + g.taxableAmount)).toBe(6600)
    expect(g.hsnBreakdown.length).toBe(1)
    expect(g.hsnBreakdown[0].hsn).toBe('040120')
    expect(g.inputGstPurchaseCount).toBe(0)

    // Two rates → two HSN rows, untouched by any one-rate assumption.
    const g2 = computeGSTReport(
      invoices as any,
      [
        { id: 'i1', tenantId: 'x', invoiceId: 'inv-tax', name: 'Milk', qty: 1, lineTotal: 6600, gstRate: 18, hsn: '040120' },
        { id: 'i2', tenantId: 'x', invoiceId: 'inv-tax', name: 'Rusk', qty: 2, lineTotal: 1050, gstRate: 5, hsn: '190540' },
      ] as any,
      [],
      range,
    )
    expect(g2.hsnBreakdown.length).toBe(2)
    expect(g2.hsnBreakdown.map(h => h.rate).sort((a, b) => a - b)).toEqual([5, 18])
  })
})