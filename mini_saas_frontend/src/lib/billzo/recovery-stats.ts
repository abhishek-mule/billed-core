import { supabaseAdmin } from './supabase-admin'

export interface RecoveryStats {
  recoveredAmount: number
  recoveredCasesCount: number
  recoveryRate: number
  lastRecoveryDate: string | null
  brokenPromiseCount: number
  brokenPromises: Array<{
    customerId: string
    customerName: string
    amount: number
    promiseDate: string
  }>
}

export async function getRecoveryMetrics(tenantId: string): Promise<RecoveryStats> {
  const now = new Date().toISOString()

  const [casesRes, attributionsRes, brokenRes] = await Promise.all([
    supabaseAdmin
      .from('recovery_cases')
      .select('recovery_state_v2, updated_at')
      .eq('tenant_id', tenantId),
    supabaseAdmin
      .from('recovery_attributions')
      .select('amount')
      .eq('tenant_id', tenantId),
    supabaseAdmin
      .from('recovery_cases')
      .select('customer_id, total_overdue, promise_to_pay_date, customers!inner(customer_name)')
      .eq('tenant_id', tenantId)
      .eq('recovery_state_v2', 'promised')
      .lt('promise_to_pay_date', now)
      .limit(10),
  ])

  const cases = casesRes.data
  const attributions = attributionsRes.data
  const broken = brokenRes.data || []

  if (!cases || cases.length === 0) {
    return {
      recoveredAmount: 0, recoveredCasesCount: 0, recoveryRate: 0,
      lastRecoveryDate: null, brokenPromiseCount: 0, brokenPromises: [],
    }
  }

  const recoveredCases = cases.filter(c => c.recovery_state_v2 === 'recovered')
  const totalCases = cases.length

  const recoveredAmount = attributions?.reduce((sum, a) =>
    sum + (parseFloat(a.amount) || 0), 0) || 0

  const lastRecovery = recoveredCases
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())[0]

  return {
    recoveredAmount,
    recoveredCasesCount: recoveredCases.length,
    recoveryRate: totalCases > 0 ? (recoveredCases.length / totalCases) * 100 : 0,
    lastRecoveryDate: lastRecovery?.updated_at || null,
    brokenPromiseCount: broken.length,
    brokenPromises: broken.map((b: any) => ({
      customerId: b.customer_id,
      customerName: b.customers?.customer_name || 'Unknown',
      amount: Number(b.total_overdue) || 0,
      promiseDate: b.promise_to_pay_date,
    })),
  }
}
