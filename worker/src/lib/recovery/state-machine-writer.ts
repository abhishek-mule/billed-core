// ============================================================
// state-machine-writer.ts — Pure builders for the recovery decision log
// ============================================================
// Pure computation only — no database access. Mirrors the production
// recovery_case_events payload JSONB contract:
//   event_type  'transition' | 'noop'
//   payload     { from_recovery_state, to_recovery_state,
//                 from_engagement_state, to_engagement_state,
//                 reason, trigger }            (snake_case keys)
//   source_event_id  originating outbox event id  (idempotency, DB-enforced unique)
//
// RPCs (045/046/054/079) and recovery-read-model.ts read:
//   event_type = 'transition'
//   payload->>from_recovery_state / payload->>to_recovery_state

import type { RecoveryCaseTransition } from '@billzo/shared'
import type { CurrentCase } from './case-machine'

// One source outbox event → exactly ONE decision-log row. This is encoded in
// migration 094: UNIQUE(source_event_id). Repeated/concurrent processing of the
// same source event must therefore be silently skipped, never producing a second
// transition, action set, or log row.

const NOOP_EVENT_TYPE = 'noop'

export interface NoopEventRow {
  caseId: string
  eventType: typeof NOOP_EVENT_TYPE
  payload: RecoveryEventPayload
}

export interface TransitionEventRow {
  caseId: string
  eventType: string
  payload: RecoveryEventPayload
}

export interface RecoveryEventPayload {
  from_recovery_state: string | null
  to_recovery_state: string | null
  from_engagement_state: string | null
  to_engagement_state: string | null
  reason: string
  trigger: Record<string, unknown>
}

export function buildTransitionEventRow(
  result: RecoveryCaseTransition,
  caseId: string,
): TransitionEventRow {
  return {
    caseId,
    eventType: result.event.eventType,
    payload: {
      from_recovery_state: result.event.fromRecoveryState ?? null,
      to_recovery_state: result.event.toRecoveryState ?? null,
      from_engagement_state: result.event.fromEngagementState ?? null,
      to_engagement_state: result.event.toEngagementState ?? null,
      reason: result.event.reason,
      trigger: result.event.trigger,
    },
  }
}

export function buildNoopEventRow(
  current: CurrentCase,
  sourceEvent: { id: string; type: string },
): NoopEventRow {
  return {
    caseId: current.id!,
    eventType: NOOP_EVENT_TYPE,
    payload: {
      from_recovery_state: current.recoveryState,
      to_recovery_state: current.recoveryState,
      from_engagement_state: current.engagementState,
      to_engagement_state: current.engagementState,
      reason: 'No state transition',
      trigger: { signalId: sourceEvent.id, type: sourceEvent.type },
    },
  }
}

export interface CaseUpsertRow {
  id: string
  tenant_id: string
  customer_id: string
  recovery_state_v2: string
  engagement_state_v2: string
  next_action_type: string | null
  next_action_due_at: string | null
  attention_score: number
  version: number
  promise_to_pay_date: string | null
  total_outstanding: number
  total_overdue: number
  open_invoice_count: number
  overdue_invoice_count: number
  disputed_invoice_count: number
  promised_invoice_count: number
  invoice_count: number
  last_activity_at: string
  updated_at: string
}

export function buildCaseUpsertRow(
  result: RecoveryCaseTransition,
  current: CurrentCase | null,
  caseId: string,
  tenantId: string,
  customerId: string,
  now: string,
): CaseUpsertRow {
  return {
    id: caseId,
    tenant_id: tenantId,
    customer_id: customerId,
    recovery_state_v2: result.recoveryState || current?.recoveryState || 'active',
    engagement_state_v2: result.engagementState || current?.engagementState || 'unseen',
    next_action_type: result.nextActionType || null,
    next_action_due_at: result.nextActionDueAt || null,
    attention_score: result.attentionScore ?? current?.attentionScore ?? 0,
    version: result.version,
    promise_to_pay_date: result.promiseToPayDate ?? null,
    total_outstanding: result.financialState.totalOutstanding,
    total_overdue: result.financialState.totalOverdue,
    open_invoice_count: result.financialState.openInvoiceCount,
    overdue_invoice_count: result.financialState.overdueInvoiceCount,
    disputed_invoice_count: result.financialState.disputedInvoiceCount,
    promised_invoice_count: result.financialState.promisedInvoiceCount,
    invoice_count: result.financialState.invoiceCount,
    last_activity_at: now,
    updated_at: now,
  }
}

// storagePayload: the JSON serialized into recovery_case_events.payload.
// Consumers read payload->>from_recovery_state etc. For display-only paths
// (frontend relative time), created_at is the ordering timestamp.
export function isProcessedErrorCode(code: string | undefined): boolean {
  return code === '23505'
}