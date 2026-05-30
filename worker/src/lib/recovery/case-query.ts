// ============================================================
// case-query.ts — Observability queries for RecoveryCase queue
// ============================================================
//
// Used by:
//   - Internal admin/debugging tooling
//   - Future homepage recovery queue
//   - Support / operational console

import { supabaseAdmin } from '../billzo/supabase-admin'
import type { RecoveryCase, RecoveryCaseEvent } from '@billzo/shared'

// ============================================================
// Get active recovery queue for a tenant
// ============================================================
// Returns active (non-recovered, non-closed) cases ordered by
// attention_score DESC, next_action_due_at ASC.

export async function getRecoveryCaseQueue(
  tenantId: string,
  limit = 20,
): Promise<{
  cases: RecoveryCase[]
  totalActive: number
  totalOverdue: number
  totalOutstanding: number
}> {
  const { data: cases, error } = await supabaseAdmin
    .from('recovery_cases')
    .select(`
      *,
      customers!inner(name, phone)
    `)
    .eq('tenant_id', tenantId)
    .not('recovery_state_v2', 'in', '("recovered","closed")')
    .order('attention_score', { ascending: false })
    .order('next_action_due_at', { ascending: true, nullsFirst: false })
    .limit(limit)

  if (error) {
    throw error
  }

  // Get totals for the summary bar
  const { data: totals } = await supabaseAdmin
    .from('recovery_cases')
    .select('recovery_state_v2, total_overdue, total_outstanding')
    .eq('tenant_id', tenantId)

  const totalActive = (totals || []).filter(
    r => r.recovery_state_v2 !== 'recovered' && r.recovery_state_v2 !== 'closed',
  ).length
  const totalOverdue = (totals || []).reduce(
    (sum, r) => sum + (parseFloat(r.total_overdue) || 0), 0,
  )
  const totalOutstanding = (totals || []).reduce(
    (sum, r) => sum + (parseFloat(r.total_outstanding) || 0), 0,
  )

  return {
    cases: mapCases(cases || []),
    totalActive,
    totalOverdue,
    totalOutstanding,
  }
}

// ============================================================
// Get single case timeline
// ============================================================

export async function getCaseTimeline(caseId: string): Promise<RecoveryCaseEvent[]> {
  const { data, error } = await supabaseAdmin
    .from('recovery_case_events')
    .select('*')
    .eq('case_id', caseId)
    .order('occurred_at', { ascending: true })

  if (error) throw error
  return mapEvents(data || [])
}

// ============================================================
// Get cases by customer
// ============================================================

export async function getCasesByCustomer(customerId: string): Promise<RecoveryCase[]> {
  const { data, error } = await supabaseAdmin
    .from('recovery_cases')
    .select('*')
    .eq('customer_id', customerId)
    .order('updated_at', { ascending: false })

  if (error) throw error
  return mapCases(data || [])
}

// ============================================================
// Summary stats for a tenant
// ============================================================

export async function getRecoverySummary(tenantId: string): Promise<{
  activeCases: number
  overdueCases: number
  disputedCases: number
  recoveredCases: number
  totalOutstanding: number
  totalOverdue: number
  attentionSum: number
}> {
  const { data, error } = await supabaseAdmin
    .from('recovery_cases')
    .select('recovery_state_v2, total_outstanding, total_overdue, attention_score')
    .eq('tenant_id', tenantId)

  if (error) throw error

  const rows = data || []
  return {
    activeCases: rows.filter(r => r.recovery_state_v2 === 'active').length,
    overdueCases: rows.filter(r => r.recovery_state_v2 === 'overdue').length,
    disputedCases: rows.filter(r => r.recovery_state_v2 === 'disputed').length,
    recoveredCases: rows.filter(r => r.recovery_state_v2 === 'recovered').length,
    totalOutstanding: rows.reduce((s, r) => s + (parseFloat(r.total_outstanding) || 0), 0),
    totalOverdue: rows.reduce((s, r) => s + (parseFloat(r.total_overdue) || 0), 0),
    attentionSum: rows.reduce((s, r) => s + (r.attention_score || 0), 0),
  }
}

// ============================================================
// Mappers (snake_case DB → camelCase TS)
// ============================================================

function mapCases(rows: any[]): RecoveryCase[] {
  return rows.map(r => ({
    id: r.id,
    tenantId: r.tenant_id,
    customerId: r.customer_id,
    invoiceCount: r.invoice_count || 0,
    openInvoiceCount: r.open_invoice_count || 0,
    overdueInvoiceCount: r.overdue_invoice_count || 0,
    disputedInvoiceCount: r.disputed_invoice_count || 0,
    promisedInvoiceCount: r.promised_invoice_count || 0,
    totalOutstanding: parseFloat(r.total_outstanding) || 0,
    totalOverdue: parseFloat(r.total_overdue) || 0,
    recoveryState: r.recovery_state_v2 || 'active',
    engagementState: r.engagement_state_v2 || 'unseen',
    nextActionType: r.next_action_type || null,
    nextActionDueAt: r.next_action_due_at || null,
    lastActivityAt: r.last_activity_at || null,
    promiseToPayDate: r.promise_to_pay_date || null,
    attentionScore: r.attention_score || 0,
    version: r.version || 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }))
}

function mapEvents(rows: any[]): RecoveryCaseEvent[] {
  return rows.map(r => ({
    id: r.id,
    caseId: r.case_id,
    eventType: r.event_type,
    fromRecoveryState: r.from_recovery_state || null,
    toRecoveryState: r.to_recovery_state || null,
    fromEngagementState: r.from_engagement_state || null,
    toEngagementState: r.to_engagement_state || null,
    reason: r.reason,
    trigger: r.trigger || {},
    occurredAt: r.occurred_at,
  }))
}
