import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { db } from '@/lib/billzo/db'

function getTenantId(): string | null {
  return cookies().get('bz_tenant')?.value || null
}

export async function GET(request: NextRequest) {
  try {
    const tenantId = getTenantId()
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const phone = searchParams.get('phone')
    const gstin = searchParams.get('gstin')
    const customerId = searchParams.get('customerId')

    if (!phone && !gstin && !customerId) {
      return NextResponse.json({ error: 'Provide phone, gstin, or customerId' }, { status: 400 })
    }

    const customer = customerId
      ? await db().customers.get(customerId)
      : await db().customers
          .where('tenantId')
          .equals(tenantId)
          .filter(c => {
            if (phone && c.phone.replace(/\D/g, '') === phone.replace(/\D/g, '')) return true
            if (gstin && c.gstin?.toUpperCase() === gstin.toUpperCase()) return true
            return false
          })
          .first()

    if (!customer) {
      return NextResponse.json({ found: false, score: null })
    }

    const invoices = await db()
      .invoices
      .where('tenantId')
      .equals(tenantId)
      .filter(inv => inv.customerId === customer.id)
      .toArray()

    const payments = await db()
      .payments
      .where('tenantId')
      .equals(tenantId)
      .filter(p => invoices.some(inv => inv.id === p.invoiceId))
      .toArray()

    const totalInvoiced = invoices.reduce((sum, inv) => sum + inv.total, 0)
    const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0)
    const outstanding = totalInvoiced - totalPaid

    const avgPaymentDays = calculateAvgPaymentDays(invoices, payments)
    const onTimeRate = calculateOnTimeRate(invoices)
    const trustScore = computeTrustScore(avgPaymentDays, onTimeRate, invoices.length)

    return NextResponse.json({
      found: true,
      customer: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        gstin: customer.gstin,
      },
      stats: {
        totalInvoices: invoices.length,
        totalInvoiced,
        totalPaid,
        outstanding,
        avgPaymentDays: avgPaymentDays ? Math.round(avgPaymentDays) : null,
        onTimeRate: onTimeRate ? Math.round(onTimeRate * 100) : null,
        trustScore,
        trustLabel: trustScore >= 80 ? 'Fast payer' : trustScore >= 50 ? 'Moderate' : 'Slow payer',
        trustEmoji: trustScore >= 80 ? '🟢' : trustScore >= 50 ? '🟡' : '🔴',
      },
      recentInvoices: invoices
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 5)
        .map(inv => ({
          id: inv.id.slice(0, 8).toUpperCase(),
          total: inv.total,
          status: inv.status,
          createdAt: inv.createdAt,
          dueAt: inv.dueAt,
        })),
    })
  } catch (err: any) {
    console.error('[BuyerIntelligence] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

function calculateAvgPaymentDays(invoices: any[], payments: any[]): number | null {
  const paidInvoices = invoices.filter(inv => inv.status === 'paid')
  if (paidInvoices.length === 0) return null

  const daysList = paidInvoices.map(inv => {
    const payment = payments.find(p => p.invoiceId === inv.id)
    if (!payment) return null
    const created = new Date(inv.createdAt).getTime()
    const paid = new Date(payment.createdAt).getTime()
    return Math.max(0, Math.round((paid - created) / (1000 * 60 * 60 * 24)))
  }).filter(d => d !== null) as number[]

  if (daysList.length === 0) return null
  return daysList.reduce((sum, d) => sum + d, 0) / daysList.length
}

function calculateOnTimeRate(invoices: any[]): number | null {
  const dueInvoices = invoices.filter(inv => inv.dueAt && inv.status !== 'unpaid')
  if (dueInvoices.length === 0) return null

  const onTime = dueInvoices.filter(inv => {
    if (inv.status === 'paid') {
      const paymentDate = inv.updatedAt || inv.createdAt
      return new Date(paymentDate) <= new Date(inv.dueAt)
    }
    return false
  })

  return onTime.length / dueInvoices.length
}

function computeTrustScore(avgDays: number | null, onTimeRate: number | null, invoiceCount: number): number {
  let score = 50

  if (avgDays !== null) {
    if (avgDays <= 7) score += 20
    else if (avgDays <= 14) score += 10
    else if (avgDays <= 30) score -= 10
    else score -= 25
  }

  if (onTimeRate !== null) {
    if (onTimeRate >= 0.8) score += 15
    else if (onTimeRate >= 0.5) score += 5
    else score -= 15
  }

  if (invoiceCount >= 5) score += 5
  else if (invoiceCount < 2) score -= 10

  return Math.max(0, Math.min(100, score))
}