// ============================================================
// Event Loader - Reconstructs financial events from event ledger
// ============================================================

import { supabaseAdmin } from '../../billzo/supabase-admin';
import { FinancialEvent } from './types';

export async function loadInvoiceEvents(
  invoiceId: string,
  tenantId: string
): Promise<FinancialEvent[]> {
  // Load from recovery_case_events (system decisions) + outbox (raw events)
  // Priority: recovery_case_events for financial transitions, outbox for raw signals
  
  const { data: caseEvents } = await supabaseAdmin
    .from('recovery_case_events')
    .select(`
      id,
      event_type,
      trigger,
      reason,
      occurred_at,
      case_id
    `)
    .eq('trigger->>invoiceId', invoiceId)
    .order('occurred_at', { ascending: true });
    
  const { data: cases } = await supabaseAdmin
    .from('recovery_cases')
    .select('id, tenant_id, customer_id')
    .in('id', caseEvents?.map(e => e.case_id) || []);

  // Also load from outbox for raw events not yet in case_events
  const { data: outboxEvents } = await supabaseAdmin
    .from('outbox')
    .select('*')
    .eq('entity_id', invoiceId)
    .eq('tenant_id', tenantId)
    .in('type', [
      'invoice.created',
      'invoice.overdue',
      'payment.recorded',
      'payment.reversed',
      'invoice.adjusted',
      'invoice.cancelled',
      'payment.completed',
      'payment.reconciled',
    ])
    .order('created_at', { ascending: true });

  // Merge and deduplicate by event ID
  const eventsMap = new Map<string, FinancialEvent>();

  // Create mapping from case_id to case for quick lookup
  const caseMap = new Map<string, { tenant_id: string; customer_id: string }>();
  for (const c of cases || []) {
    caseMap.set(c.id, { tenant_id: c.tenant_id, customer_id: c.customer_id });
  }

  // Add case events first (they're the source of truth for state transitions)
  for (const e of caseEvents || []) {
    const trigger = e.trigger as Record<string, unknown> || {};
    const caseInfo = caseMap.get(e.case_id) || { tenant_id: tenantId, customer_id: '' };
    eventsMap.set(e.id, {
      type: e.event_type,
      id: e.id,
      occurredAt: e.occurred_at,
      invoiceId,
      customerId: caseInfo.customer_id,
      tenantId: caseInfo.tenant_id,
      amount: trigger.amount !== undefined ? (trigger.amount as number) : undefined,
      status: trigger.invoiceStatus !== undefined ? (trigger.invoiceStatus as string) : undefined,
      dueDate: trigger.dueDate !== undefined ? (trigger.dueDate as string) : undefined,
      adjustmentType: trigger.adjustmentType !== undefined ? (trigger.adjustmentType as 'credit' | 'debit') : undefined,
      adjustmentAmount: trigger.adjustmentAmount !== undefined ? (trigger.adjustmentAmount as number) : undefined,
      reversalAmount: trigger.reversalAmount !== undefined ? (trigger.reversalAmount as number) : undefined,
      rawPayload: trigger,
    });
  }

  // Add outbox events for any missing financial events
  for (const e of outboxEvents || []) {
    if (!eventsMap.has(e.id)) {
      const payload = e.payload as Record<string, unknown> || {};
      eventsMap.set(e.id, {
        type: e.type,
        id: e.id,
        occurredAt: e.created_at,
        invoiceId,
        customerId: payload.customerId !== undefined ? (payload.customerId as string) : '',
        tenantId: e.tenant_id,
        amount: (payload.amount !== undefined || payload.total !== undefined) ? ((payload.amount || payload.total) as number) : undefined,
        status: payload.status !== undefined ? (payload.status as string) : undefined,
        dueDate: payload.due_date !== undefined ? (payload.due_date as string) : undefined,
        adjustmentType: payload.adjustmentType !== undefined ? (payload.adjustmentType as 'credit' | 'debit') : undefined,
        adjustmentAmount: payload.adjustmentAmount !== undefined ? (payload.adjustmentAmount as number) : undefined,
        reversalAmount: payload.reversalAmount !== undefined ? (payload.reversalAmount as number) : undefined,
        rawPayload: payload,
      });
    }
  }

  // Sort by occurredAt
  return Array.from(eventsMap.values()).sort((a, b) => 
    new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime()
  );
}

export async function loadInvoiceCurrentState(
  invoiceId: string,
  tenantId: string
): Promise<{
  triggerOutstanding: number;
  reducerOutstanding: number;
  recoveryCaseOutstanding: number | null;
  invoiceData: any;
}> {
  // 1. Trigger-maintained outstanding (invoices.outstanding_amount)
  const { data: invoice } = await supabaseAdmin
    .from('invoices')
    .select('outstanding_amount, total, paid_amount, status, invoice_number, customer_id')
    .eq('id', invoiceId)
    .eq('tenant_id', tenantId)
    .single();

  // 2. Reducer replay (we'll compute this in trace.ts)
  // 3. Recovery case outstanding
  let recoveryCaseOutstanding: number | null = null;
  if (invoice?.customer_id) {
    const { data: rc } = await supabaseAdmin
      .from('recovery_cases')
      .select('total_outstanding')
      .eq('tenant_id', tenantId)
      .eq('customer_id', invoice.customer_id)
      .single();
    recoveryCaseOutstanding = rc?.total_outstanding ?? null;
  }

  return {
    triggerOutstanding: invoice?.outstanding_amount ?? 0,
    reducerOutstanding: 0, // computed in trace
    recoveryCaseOutstanding,
    invoiceData: invoice,
  };
}