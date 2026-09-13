import { supabaseAdmin } from '../billzo/supabase-admin'

export async function fetchRecoveryCaseByCustomer(tenantId: string, customerId: string) {
  const { data, error } = await supabaseAdmin
    .from('recovery_cases')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('customer_id', customerId)
    .maybeSingle()

  if (error) {
    console.error('[fetchRecoveryCaseByCustomer] error:', error)
    return null
  }

  return data
}

export async function fetchCustomerRecoveryMetrics(tenantId: string, customerId: string) {
  const [{ data: openInvoices }, { data: lastPayment }, { data: oldestOverdue }] = await Promise.all([
    supabaseAdmin
      .from('invoices')
      .select('id, total, outstanding_amount')
      .eq('tenant_id', tenantId)
      .eq('customer_id', customerId)
      .gt('outstanding_amount', 0),
    supabaseAdmin
      .from('payments')
      .select('paid_at')
      .eq('tenant_id', tenantId)
      .eq('customer_id', customerId)
      .order('paid_at', { ascending: false })
      .limit(1),
    supabaseAdmin
      .from('invoices')
      .select('due_date')
      .eq('tenant_id', tenantId)
      .eq('customer_id', customerId)
      .gt('outstanding_amount', 0)
      .order('due_date', { ascending: true })
      .limit(1)
  ])

  const openInvoiceCount = openInvoices?.length || 0
  const oldestOverdueDays = oldestOverdue?.[0]?.due_date
    ? Math.max(0, Math.floor((Date.now() - new Date(oldestOverdue[0].due_date).getTime()) / (1000 * 60 * 60 * 24)))
    : 0
  const lastPaymentAt = lastPayment?.[0]?.paid_at || null

  return { openInvoiceCount, oldestOverdueDays, lastPaymentAt }
}