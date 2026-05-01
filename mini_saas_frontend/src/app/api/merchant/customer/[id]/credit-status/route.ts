import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/session'
import { query, queryOne } from '@/lib/db/client'

export const dynamic = 'force-dynamic'

interface CreditProfile {
  pending: number
  creditLimit: number
  daysOverdue: number
  riskScore: number
  canExtendCredit: boolean
  lastPaymentDate?: string
  totalInvoices: number
  paidInvoices: number
}

function calculateRiskScore(profile: {
  pending: number
  creditLimit: number
  daysOverdue: number
}): number {
  let riskScore = 0.0

  // Credit utilization risk (0-0.4)
  const utilization = profile.pending / profile.creditLimit
  if (utilization > 0.9) riskScore += 0.4
  else if (utilization > 0.8) riskScore += 0.3
  else if (utilization > 0.6) riskScore += 0.2
  else if (utilization > 0.4) riskScore += 0.1

  // Overdue risk (0-0.4)
  if (profile.daysOverdue > 45) riskScore += 0.4
  else if (profile.daysOverdue > 30) riskScore += 0.3
  else if (profile.daysOverdue > 15) riskScore += 0.2
  else if (profile.daysOverdue > 7) riskScore += 0.1

  // Payment history risk (0-0.2) - this would be enhanced with historical data
  // For now, base it on overdue status
  if (profile.daysOverdue > 0) riskScore += 0.2

  return Math.min(riskScore, 1.0)
}

function calculateOverdueAge(lastPaymentDate?: string): number {
  if (!lastPaymentDate) return 0
  const paymentDate = new Date(lastPaymentDate)
  const today = new Date()
  const diffTime = Math.abs(today.getTime() - paymentDate.getTime())
  return Math.floor(diffTime / (1000 * 60 * 60 * 24))
}

export async function GET(
  request: NextRequest,
  { params }: { params: { customerId: string } }
) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { customerId } = params
    const { tenantId } = session

    // Get customer details
    const customer = await queryOne<any>(
      `SELECT 
        id,
        customer_name,
        phone,
        credit_limit,
        pending_amount,
        credit_score,
        last_payment_date,
        days_overdue
       FROM customers 
       WHERE id = $1 AND tenant_id = $2 AND is_active = true`,
      [customerId, tenantId]
    )

    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    // Calculate pending invoices total
    const pendingResult = await queryOne<{ total: string }>(
      `SELECT COALESCE(SUM(total::numeric), 0) as total
       FROM invoices 
       WHERE customer_id = $1 
       AND tenant_id = $2 
       AND payment_mode = 'CREDIT'
       AND status NOT IN ('PAID', 'CANCELLED', 'VOIDED')`,
      [customerId, tenantId]
    )

    const pending = parseFloat(pendingResult?.total || '0')
    const creditLimit = parseFloat(customer.credit_limit?.toString() || '50000')
    const daysOverdue = customer.days_overdue || 0

    // Calculate risk score
    const riskScore = calculateRiskScore({
      pending,
      creditLimit,
      daysOverdue
    })

    // Determine if credit can be extended
    const canExtendCredit = pending < creditLimit && riskScore < 0.7

    // Get invoice statistics
    const invoiceStats = await queryOne<{ total: string, paid: string }>(
      `SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'PAID') as paid
       FROM invoices 
       WHERE customer_id = $1 AND tenant_id = $2`,
      [customerId, tenantId]
    )

    const creditProfile: CreditProfile = {
      pending,
      creditLimit,
      daysOverdue,
      riskScore,
      canExtendCredit,
      lastPaymentDate: customer.last_payment_date,
      totalInvoices: parseInt(invoiceStats?.total || '0'),
      paidInvoices: parseInt(invoiceStats?.paid || '0')
    }

    return NextResponse.json({
      success: true,
      customer: {
        id: customer.id,
        name: customer.customer_name,
        phone: customer.phone
      },
      creditProfile
    })

  } catch (error: any) {
    console.error('[Customer Credit Status] Error:', error)
    return NextResponse.json({ error: 'Failed to fetch credit status' }, { status: 500 })
  }
}