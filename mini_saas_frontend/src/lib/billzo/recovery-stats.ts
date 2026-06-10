import { supabaseAdmin } from './supabase-admin'

export interface RecoveryStats {
  recoveredAmount: number
  recoveredCasesCount: number
  recoveryRate: number
  lastRecoveryDate: string | null
}

export async function getRecoveryMetrics(tenantId: string): Promise<RecoveryStats> {
  // 1. Get recovery cases metrics
  const { data: cases } = await supabaseAdmin
    .from('recovery_cases')
    .select('recovery_state_v2, updated_at')
    .eq('tenant_id', tenantId)

  if (!cases || cases.length === 0) {
    return { recoveredAmount: 0, recoveredCasesCount: 0, recoveryRate: 0, lastRecoveryDate: null }
  }

  const recoveredCases = cases.filter(c => c.recovery_state_v2 === 'recovered')
  const totalCases = cases.length

  // 2. Get attributed payments for recovered amount
  const { data: attributions } = await supabaseAdmin
    .from('recovery_attributions')
    .select('payment_id, payments!inner(amount)')
    .eq('invoices!inner(tenant_id)', tenantId)

  const recoveredAmount = attributions?.reduce((sum, a) => {
    const pmt = a.payments as { amount?: number } | { amount?: number }[] | undefined
    const amount = Array.isArray(pmt) ? (pmt[0]?.amount || 0) : (pmt?.amount || 0)
    return sum + amount
  }, 0) || 0

  const lastRecovery = recoveredCases
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())[0]

  return {
    recoveredAmount,
    recoveredCasesCount: recoveredCases.length,
    recoveryRate: (recoveredCases.length / totalCases) * 100,
    lastRecoveryDate: lastRecovery?.updated_at || null,
  }
}
