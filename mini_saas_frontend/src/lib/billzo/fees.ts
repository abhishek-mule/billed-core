import { supabaseAdmin } from './supabase-admin'

export interface FeeCalculation {
  totalRecovered: number
  feeAmount: number
  feeBreakdown: {
    flatFee: number
    percentageFee: number
    cappedFee: number
    appliedFee: number
    appliedMethod: 'flat' | 'percentage' | 'capped'
  }
  invoiceCount: number
  period: {
    start: string
    end: string
  }
}

/**
 * Calculate success fee for a tenant's recovered amount.
 * Model: ₹49 flat OR 2% capped at ₹299, whichever is LOWER.
 */
export function calculateSuccessFee(recoveredAmount: number): FeeCalculation['feeBreakdown'] {
  const flatFee = 49
  const percentageFee = Math.round(recoveredAmount * 0.02)
  const cappedFee = Math.min(percentageFee, 299)
  const appliedFee = Math.min(flatFee, cappedFee)

  let appliedMethod: 'flat' | 'percentage' | 'capped' = 'flat'
  if (appliedFee === flatFee && flatFee <= cappedFee) {
    appliedMethod = 'flat'
  } else if (appliedFee === cappedFee && cappedFee === percentageFee) {
    appliedMethod = 'percentage'
  } else {
    appliedMethod = 'capped'
  }

  return {
    flatFee,
    percentageFee,
    cappedFee,
    appliedFee,
    appliedMethod,
  }
}

/**
 * Get monthly recovery summary for a tenant.
 */
export async function getMonthlyRecoverySummary(tenantId: string): Promise<FeeCalculation> {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)

  // Get invoices paid this month
  const { data: paidInvoices } = await supabaseAdmin
    .from('invoices')
    .select('id, total, paid_amount, updated_at')
    .eq('tenant_id', tenantId)
    .eq('status', 'paid')
    .gte('updated_at', startOfMonth.toISOString())
    .lte('updated_at', endOfMonth.toISOString())

  const totalRecovered = paidInvoices?.reduce((sum, inv) => sum + (inv.paid_amount || inv.total || 0), 0) || 0
  const invoiceCount = paidInvoices?.length || 0

  const feeBreakdown = calculateSuccessFee(totalRecovered)

  return {
    totalRecovered,
    feeAmount: feeBreakdown.appliedFee,
    feeBreakdown,
    invoiceCount,
    period: {
      start: startOfMonth.toISOString(),
      end: endOfMonth.toISOString(),
    },
  }
}
