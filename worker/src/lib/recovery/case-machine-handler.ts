// ============================================================
// RECOVERY CASE STATE MACHINE — Handler (movable, testable)
// ============================================================
// Drives the RecoveryCase truth spine from domain events.
// Runs AFTER behavioral materialization (engagement computed)
// but BEFORE cognition (pipeline reads fresh RecoveryCase state).
//
// Idempotency: every source event is claimed in
// recovery_case_event_consumptions BEFORE any mutation. The claim
// (INSERT ... ON CONFLICT DO NOTHING) is the atomic serialization
// point — only the winning concurrent handler may mutate the case.
//
// B-05: the previous implementation read the consumption table first
// and only inserted the consumption row AFTER mutating the case, so
// two concurrent handlers for the same event both passed the read and
// both mutated state (double recovery_case_events log rows, version
// escalation, or two cases for brand-new customers). Claim-first with
// a deterministic case id fixes the race without a schema change.

import crypto from 'crypto'
import { supabaseAdmin } from '../billzo/supabase-admin'
import { transitionCase, canHandleEvent } from './case-machine'
import type { CurrentCase, SignalEvent } from './case-machine'
import { spineDiagnostics } from '../spine-diagnostics'
import { createQueueLogger } from '../../../lib/queue-logger'
import { recordBrokenPromisesLedger } from './promise-outcome-ledger'

const logger = createQueueLogger('outbox')
const CASE_NAMESPACE = '6ba7b811-9dad-11d1-80b4-00c04fd430c8'

/** Deterministic, stable case id for brand-new cases (uuidv5 of tenant+customer).
 *  Two concurrent handlers for the same new customer must agree on the SAME
 *  case id so the consumption claim serializes the very first creation. */
export function deterministicCaseId(tenantId: string, customerId: string): string {
  const hash = crypto.createHash('sha1').update(`${CASE_NAMESPACE}:${tenantId}:${customerId}`).digest()
  hash[6] = (hash[6] & 0x0f) | 0x50 // version 5
  hash[8] = (hash[8] & 0x3f) | 0x80 // RFC 4122 variant
  const hex = hash.subarray(0, 16).toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

type DbLike = Pick<typeof supabaseAdmin, 'from'>

export async function tryHandleRecoveryCaseStateMachine(
  event: any,
  db: DbLike = supabaseAdmin,
): Promise<void> {
  console.log('[StateMachine] Ingesting event:', event.type, event.entityId);
  if (!canHandleEvent(event.type)) {
    console.log('[StateMachine] Event type ignored:', event.type);
    return;
  }

  const tenantId = event.tenantId
  if (!tenantId) return

  // Resolve customer_id: events MUST carry it in payload (E1: Event Sovereignty)
  let customerId: string | undefined = event.payload?.customerId
  if (!customerId) {
    console.warn('[StateMachine] Event without customerId in payload — falling back to invoice lookup', { type: event.type, entityId: event.entityId, tenantId })
    spineDiagnostics.missingCustomerId(event.type)
    const invoiceId = event.entityId
    if (!invoiceId) return
    const { data: invoice } = await db
      .from('invoices')
      .select('customer_id')
      .eq('id', invoiceId)
      .maybeSingle()
    customerId = invoice?.customer_id
  }
  if (!customerId) return

  // 2. Read current RecoveryCase for this (tenant, customer)
  const { data: existing } = await db
    .from('recovery_cases')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('customer_id', customerId)
    .limit(1)
    .single()

  const current: CurrentCase | null = existing
    ? {
        id: existing.id,
        tenantId: existing.tenant_id,
        customerId: existing.customer_id,
        invoiceCount: existing.invoice_count || 0,
        openInvoiceCount: existing.open_invoice_count || 0,
        overdueInvoiceCount: existing.overdue_invoice_count || 0,
        disputedInvoiceCount: existing.disputed_invoice_count || 0,
        promisedInvoiceCount: existing.promised_invoice_count || 0,
        totalOutstanding: existing.total_outstanding || 0,
        totalOverdue: existing.total_overdue || 0,
        recoveryState: existing.recovery_state_v2 || 'active',
        engagementState: existing.engagement_state_v2 || 'unseen',
        nextActionType: existing.next_action_type || null,
        nextActionDueAt: existing.next_action_due_at || null,
        lastActivityAt: existing.last_activity_at || null,
        promiseToPayDate: existing.promise_to_pay_date || null,
        attentionScore: existing.attention_score || 0,
        version: existing.version || 1,
      }
    : null

  // Case id: existing id, or deterministic for brand-new cases so that
  // concurrent handlers contend on the SAME claim key.
  const caseId = current?.id ?? deterministicCaseId(tenantId, customerId)

  // 3. ATOMIC CLAIM (B-05 race fix). Only the winner proceeds to mutate.
  const claim = await db
    .from('recovery_case_event_consumptions')
    .upsert({ source_event_id: event.id, case_id: caseId }, { onConflict: 'source_event_id,case_id', ignoreDuplicates: true })
    .select('source_event_id')

  if (!claim.data || claim.data.length === 0) {
    console.log('[StateMachine] Skipping already-processed event:', event.id)
    return // another handler claimed this event first — no mutation
  }

  // 3b. Mark payment as processed when worker begins handling it
  if (event.type === 'payment.completed' && event.payload?.paymentId) {
    await db
      .from('payments')
      .update({ lifecycle_status: 'processed', updated_at: new Date().toISOString() })
      .eq('id', event.payload.paymentId)
      .then(() => {}, () => {})
  }

  // 4. Build signal event for the state machine
  const invoiceId = event.entityId || null
  const signal: SignalEvent = {
    type: event.type,
    id: event.id,
    tenantId,
    customerId,
    invoiceId,
    amount: event.payload?.amount || event.payload?.total || null,
    invoiceStatus: event.payload?.status || null,
    dueDate: event.payload?.due_date || null,
    reminderStage: event.payload?.reminderStage || event.payload?.stage || null,
    deliveryStatus: event.payload?.deliveryStatus || event.payload?.status || null,
    failureCount: event.payload?.failureCount || event.payload?.consecutive_failures || null,
    merchantAction: event.payload?.merchantAction || event.payload?.reason || null,
    snoozeDuration: event.payload?.snoozeDuration || null,
    occurredAt: event.created_at || new Date().toISOString(),
  }

  // 5. Compute transition
  // Phase 0 probe: detect non-deterministic states (handleMerchantSnoozed uses Date.now())
  if (event.type === 'merchant.snoozed') {
    spineDiagnostics.dateNowInDomain('case-machine:handleMerchantSnoozed')
    spineDiagnostics.nonDeterministicUuid('case-machine:handleMerchantSnoozed')
  }
  const result = transitionCase(current, signal)
  console.log('[StateMachine] Transition result:', {
    type: signal.type,
    resultExists: !!result,
    recoveryState: result?.recoveryState
  });

  if (!result) {
    // No-op transition (e.g., first/second reminder failure).
    // The event is already claimed above, so re-processing is impossible.
    return
  }

  // 6. Upsert case row with new state
  const now = new Date().toISOString()

  console.log('[StateMachine] Upserting case:', caseId, 'to state:', result.recoveryState || current?.recoveryState);

  const { error: upsertError } = await db
    .from('recovery_cases')
    .upsert({
      id: caseId,
      tenant_id: tenantId,
      customer_id: customerId,
      // v2 state columns
      recovery_state_v2: result.recoveryState || current?.recoveryState || 'active',
      engagement_state_v2: result.engagementState || current?.engagementState || 'unseen',
      next_action_type: result.nextActionType || null,
      next_action_due_at: result.nextActionDueAt || null,
      attention_score: result.attentionScore ?? current?.attentionScore ?? 0,
      version: result.version,
      promise_to_pay_date: result.promiseToPayDate ?? null,
      // Financial state from state machine (single source of truth)
      total_outstanding: result.financialState.totalOutstanding,
      total_overdue: result.financialState.totalOverdue,
      open_invoice_count: result.financialState.openInvoiceCount,
      overdue_invoice_count: result.financialState.overdueInvoiceCount,
      disputed_invoice_count: result.financialState.disputedInvoiceCount,
      promised_invoice_count: result.financialState.promisedInvoiceCount,
      invoice_count: result.financialState.invoiceCount,
      // Activity
      last_activity_at: now,
      updated_at: now,
    }, { onConflict: 'id' })

  if (upsertError) {
    logger.error({ tenantId, caseId, err: upsertError.message }, 'Failed to upsert recovery case')
    // Release the claim so a retry can reprocess this event.
    await db
      .from('recovery_case_event_consumptions')
      .delete()
      .eq('source_event_id', event.id)
      .eq('case_id', caseId)
      .then(() => {}, () => {})
    return
  } else {
    console.log('[StateMachine] Upsert successful for case:', caseId);
  }

  // 6b. Mark payment as projected when recovery case is updated
  if (event.type === 'payment.completed' && event.payload?.paymentId) {
    await db
      .from('payments')
      .update({ lifecycle_status: 'projected', updated_at: new Date().toISOString() })
      .eq('id', event.payload.paymentId)
      .then(() => {}, () => {})
  }

  // 7. Insert recovery_case_event (append-only decision log)
  const { error: eventError } = await db
    .from('recovery_case_events')
    .insert({
      case_id: caseId,
      event_type: result.event.eventType,
      from_recovery_state: result.event.fromRecoveryState,
      to_recovery_state: result.event.toRecoveryState,
      from_engagement_state: result.event.fromEngagementState,
      to_engagement_state: result.event.toEngagementState,
      reason: result.event.reason,
      trigger: result.event.trigger,
    })

  if (eventError) {
    logger.error({ tenantId, caseId, err: eventError.message }, 'Failed to insert recovery case event')
  }

  // 8. (claim already inserted at step 3 — no separate idempotency write)

  // 9. Write to payment_promises table for decision engine visibility
  if (event.type === 'promise.made' && result.promiseToPayDate) {
    // The attempt that prompted this promise, when the origin is known
    // explicitly. Missing => untracked, never guessed from timestamps.
    const triggeredByActionId = event.payload?.actionId || event.payload?.triggeredByActionId || null
    await db
      .from('payment_promises')
      .upsert({
        tenant_id: tenantId,
        customer_id: customerId,
        invoice_id: event.payload?.invoiceId || invoiceId,
        promise_date: result.promiseToPayDate,
        amount: signal.amount || 0,
        status: 'active',
        notes: event.payload?.notes || null,
        triggered_by_action_id: triggeredByActionId,
      }, { onConflict: undefined, ignoreDuplicates: false })
      .then(() => {}, () => {})
  }
  if (event.type === 'promise.broken') {
    // Record promise_broken outcomes against the causal spine for every active
    // promise (attempt unknown => UNKNOWN attribution, never timestamp-guessed).
    await recordBrokenPromisesLedger({
      tenantId,
      customerId,
      occurredAt: new Date().toISOString(),
    })

    await db
      .from('payment_promises')
      .update({ status: 'broken' })
      .eq('customer_id', customerId)
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .then(() => {}, () => {})
  }
}