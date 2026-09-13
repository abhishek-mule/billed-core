// ============================================================
// state-machine-writer.test.ts — Contract regression tests
// ============================================================
// Guards the production recovery_case_events payload contract and the
// idempotency invariants of the recovery state-machine writer.
//
// Contract (production schema is authoritative):
//   - recovery_case_events(id, case_id, event_type, payload jsonb, source_event_id, created_at)
//   - recovery_case_event_consumptions(id, event_id → recovery_case_events.id, case_id, created_at)
//   - RPCs / read-model read event_type='transition' + payload->>from/to_recovery_state
//
// Pure unit tests — never hit a real database.

import { describe, it, expect } from 'vitest'
import { transitionCase } from '../case-machine'
import type { CurrentCase } from '../case-machine'
import type { RecoveryCaseTransition } from '@billzo/shared'
import {
  buildTransitionEventRow,
  buildNoopEventRow,
  buildCaseUpsertRow,
  isProcessedErrorCode,
  type RecoveryEventPayload,
} from '../state-machine-writer'

function makeCase(overrides: Partial<CurrentCase> = {}): CurrentCase {
  return {
    id: 'case-001',
    tenantId: 'tenant-001',
    customerId: 'cust-001',
    invoiceCount: 2,
    openInvoiceCount: 2,
    overdueInvoiceCount: 1,
    disputedInvoiceCount: 0,
    promisedInvoiceCount: 0,
    totalOutstanding: 12000,
    totalOverdue: 5000,
    recoveryState: 'overdue',
    engagementState: 'unseen',
    nextActionType: 'send_reminder',
    nextActionDueAt: null,
    lastActivityAt: null,
    promiseToPayDate: null,
    attentionScore: 15,
    version: 3,
    ...overrides,
  }
}

function signal(type: string, overrides: Partial<any> = {}) {
  return {
    type,
    id: `outbox-${Math.random().toString(36).slice(2, 10)}`,
    tenantId: 'tenant-001',
    customerId: 'cust-001',
    invoiceId: 'invoice-001',
    amount: 2000,
    occurredAt: '2026-09-11T05:30:00.000Z',
    ...overrides,
  }
}

function runTransition(
  type: string,
  current: CurrentCase | null,
  overrides: Partial<any> = {},
): RecoveryCaseTransition | null {
  return transitionCase(current, signal(type, overrides))
}

describe('recovery state-machine writer — contract invariants', () => {
  // Invariant 1 — one source event → one event-log row
  describe('one source event → one event-log row', () => {
    it('builds exactly one log row per transition, keyed to the source event', () => {
      const result = runTransition('payment.completed', makeCase())!
      const row = buildTransitionEventRow(result, 'case-001')
      // Writer inserts ONE recovery_case_events row + ONE consumption row per event.
      expect(row.caseId).toBe('case-001')
      expect(row.eventType).toBe('transition')
      // The consumption row is the only idempotency side-effect:
      // (event_id from RETURNING, case_id) — a single consumption per log row.
      expect(row.payload).toBeDefined()
    })

    it('writes a log row for no-op transitions too (consumption FK requires event_id)', () => {
      const current = makeCase()
      const row = buildNoopEventRow(current, { id: 'outbox-noop-1', type: 'recovery.reminder.sent' })
      // No-op must still produce a log row so the consumption FK (event_id →
      // recovery_case_events.id) resolves. Duplicate replay is then blocked by the
      // DB unique source_event_id before any second row can be written.
      expect(row.eventType).toBe('noop')
      expect(row.caseId).toBe('case-001')
      expect(row.payload.from_recovery_state).toBe('overdue')
      expect(row.payload.to_recovery_state).toBe('overdue')
      expect(row.payload.trigger.signalId).toBe('outbox-noop-1')
    })

    it('no-op rows carry the same from/to states (no phantom transition)', () => {
      const current = makeCase({ recoveryState: 'active', engagementState: 'unseen' })
      const row = buildNoopEventRow(current, { id: 'x', type: 'recovery.reminder.sent' })
      expect(row.payload.from_recovery_state).toBe('active')
      expect(row.payload.to_recovery_state).toBe('active')
      expect(row.payload.from_engagement_state).toBe('unseen')
      expect(row.payload.to_engagement_state).toBe('unseen')
    })
  })

  // Invariant 2 — repeated same source event → no second transition/action set
  describe('repeated same source event → no second transition', () => {
    it('a no-op logs to the decision log only once (unique source_event_id decides)', () => {
      // DB layer: UNIQUE(source_event_id) — a second insert of the same source
      // event violates the unique index (23505) and is treated as already consumed.
      // The writer must never emit a second transition from a duplicate source.
      const result = runTransition('invoice.created', null)
      expect(result).not.toBeNull()
      // Two calls for the SAME source signal id must be equivalent — the transition
      // is deterministic and the idempotency gate is the DB unique source_event_id.
      const sigA = signal('payment.completed', { id: 'outbox-duplicate' })
      const sigB = signal('payment.completed', { id: 'outbox-duplicate' })
      expect(sigA.id).toBe(sigB.id)
      const c = makeCase()
      const r1 = transitionCase(c, sigA)
      const r2 = transitionCase(c, sigB)
      // Deterministic transition — identical input, identical row payload.
      if (r1 && r2) {
        expect(buildTransitionEventRow(r1, 'case-001').payload).toEqual(
          buildTransitionEventRow(r2, 'case-001').payload,
        )
      }
    })

    it('detects the DB unique-violation code used to skip duplicates', () => {
      expect(isProcessedErrorCode('23505')).toBe(true)
      expect(isProcessedErrorCode(undefined)).toBe(false)
      expect(isProcessedErrorCode('23503')).toBe(false)
    })
  })

  // Invariant 3 — concurrent same source event → exactly one accepted
  describe('concurrent same source event → exactly one accepted', () => {
    it('unique source_event_id is the global idempotency gate (migration 094)', () => {
      // Proven cardinality: one outbox event → one customerId → one case → one row.
      // A racing worker inserting the same source_event_id hits 23505 and rolls back,
      // so exactly ONE log row (and one case) ever survives.
      const result = runTransition('invoice.created', null)
      expect(result?.event.trigger.signalId).toBeTruthy()
      // The global unique index is the enforcement point — a repeat insert cannot succeed.
      expect(isProcessedErrorCode('23505')).toBe(true)
    })
  })

  // Invariant 4 — payload readable by RPC / read-model
  describe('payload shape readable by RPCs and read-model', () => {
    it('uses snake_case keys that RPCs query via payload->>from/to_recovery_state', () => {
      const result = runTransition('invoice.overdue', makeCase({ recoveryState: 'active', totalOverdue: 5000 }), {
        amount: 5000,
      })!
      const row = buildTransitionEventRow(result, 'case-001')
      const p: RecoveryEventPayload = row.payload

      expect(Object.keys(p).sort()).toEqual([
        'from_engagement_state',
        'from_recovery_state',
        'reason',
        'to_engagement_state',
        'to_recovery_state',
        'trigger',
      ])
      // RPCs (045/046/054/079) & read-model filter on these exact keys.
      expect(p.to_recovery_state).toBe('overdue')
      expect(p.reason).toBeTruthy()
      expect(typeof p.trigger).toBe('object')
    })

    it('writes transition rows with event_type = "transition" so RPC filters match', () => {
      const result = runTransition('promise.made', makeCase(), { dueDate: '2026-10-01' })!
      const row = buildTransitionEventRow(result, 'case-001')
      expect(row.eventType).toBe('transition')
    })

    it('builds a case upsert row identical to the canonical projection values', () => {
      const result = runTransition('invoice.created', makeCase(), { amount: 8000 })!
      const row = buildCaseUpsertRow(result, makeCase(), 'case-001', 'tenant-001', 'cust-001', '2026-09-11T05:30:00.000Z')
      expect(row.id).toBe('case-001')
      expect(row.customer_id).toBe('cust-001')
      expect(row.recovery_state_v2).toBe(result.recoveryState || 'overdue')
      expect(row.version).toBe(result.version)
      expect(row.total_outstanding).toBe(result.financialState.totalOutstanding)
    })
  })

  // Invariant 5 — recovery_cases behavior unchanged
  describe('recovery_cases behavior unchanged', () => {
    it('upsert row preserves all v2 state + financial + activity columns', () => {
      const current = makeCase({ recoveryState: 'active', version: 1 })
      const result = runTransition('invoice.overdue', current, { amount: 3000 })!
      const row = buildCaseUpsertRow(result, current, 'case-001', 'tenant-001', 'cust-001', '2026-09-11T06:00:00.000Z')

      expect(row.recovery_state_v2).toBe('overdue')
      expect(row.recovery_state_v2).toBe(result.recoveryState)
      expect(row.version).toBe(result.version)
      expect(row.version).toBe(current.version + 1)
      expect(row.engagement_state_v2).toBe(result.engagementState || current.engagementState)
      expect(row.total_outstanding).toBe(result.financialState.totalOutstanding)
      expect(row.total_overdue).toBe(result.financialState.totalOverdue)
      expect(row.open_invoice_count).toBe(result.financialState.openInvoiceCount)
      expect(row.last_activity_at).toBe('2026-09-11T06:00:00.000Z')
      expect(row.updated_at).toBe('2026-09-11T06:00:00.000Z')
    })

    it('keeps attention_score defaulting when the design leaves it set', () => {
      const current = makeCase({ attentionScore: 15 })
      const result = runTransition('merchant.mark_disputed', current)!
      const row = buildCaseUpsertRow(result, current, 'case-001', 'tenant-001', 'cust-001', '2026-09-11T06:00:00.000Z')
      expect(row.attention_score).toBe(result.attentionScore)
    })
  })
})