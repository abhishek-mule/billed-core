import { supabaseAdmin } from '../billzo/supabase-admin'
import type { NextActionType } from '@billzo/shared'

export interface PriorityCase {
  caseId: string
  customerId: string
  customerName: string
  phone: string
  totalOverdue: number
  oldestOverdueDays: number
  attentionScore: number
  nextActionType: NextActionType
  promiseToPayDate: string | null
  ignoredReminders: number
  brokenPromises: number
  openInvoiceCount: number
  automationMode: 'full_auto' | 'manual' | 'muted'
}

export async function fetchPriorityCases(tenantId: string, limit = 5): Promise<PriorityCase[]> {
  const { data, error } = await supabaseAdmin.rpc('get_priority_cases', {
    p_tenant_id: tenantId,
    p_limit: limit
  })

  if (error) {
    console.error('[fetchPriorityCases] RPC error:', error)
    return []
  }

  return (data || []).map(mapPriorityCase)
}

function mapPriorityCase(row: any): PriorityCase {
  return {
    caseId: row.case_id,
    customerId: row.customer_id,
    customerName: row.customer_name,
    phone: row.phone,
    totalOverdue: parseFloat(row.total_overdue) || 0,
    oldestOverdueDays: parseInt(row.oldest_overdue_days) || 0,
    attentionScore: parseInt(row.attention_score) || 0,
    nextActionType: row.next_action_type as NextActionType,
    promiseToPayDate: row.promise_to_pay_date,
    ignoredReminders: parseInt(row.ignored_reminders) || 0,
    brokenPromises: parseInt(row.broken_promises) || 0,
    openInvoiceCount: parseInt(row.open_invoice_count) || 0,
    automationMode: row.automation_mode as 'full_auto' | 'manual' | 'muted'
  }
}

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
      .in('status', ['unpaid', 'overdue', 'partial']),
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
      .in('status', ['unpaid', 'overdue', 'partial'])
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