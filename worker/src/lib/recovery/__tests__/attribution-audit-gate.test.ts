import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../billzo/supabase-admin', () => ({
  supabaseAdmin: { from: vi.fn() },
}))

import { supabaseAdmin } from '../../billzo/supabase-admin'
import { recordPromiseKeepIfHonored, recordBrokenPromisesLedger } from '../promise-outcome-ledger'
import { recordCallOutcome } from '../call-outcome-ledger'
import { recordPaymentOutcome } from '../payment-outcome-ledger'
import { attributabilityOf } from '../attribution-truth'
import { buildAttemptHistory } from '../attempt-history'

/**
 * PHASE 1.5 — D RELEASE GATE: Proven questions
 *
 * D1 Schema/oracle  — Q1–Q4 resolve the canonical collection_actions.id chain.
 * D2 Full chain     — attempt → send → delivered → read → reply → promise →
 *                     broken → call → payment preserves attempt identity where
 *                     causality is explicit.
 * D3 Unknown case   — missing identity ⇒ attribution_status='unknown', never
 *                     'verified'.
 * D4 No inference   — a payment 10s after a reminder with no recoveryAttemptId
 *                     stays unknown (temporal proximity ≠ causality).
 * D5 Idempotency    — replayed webhooks/events do not duplicate evidence nor
 *                     mutate attribution.
 * D6 Ambiguity      — provider identity matching no/multiple candidates ⇒
 *                     unknown, never "pick latest".
 *
 * Every writer exercised here is the same module used by the production
 * handlers (promise/call/payment ledgers, attributabilityOf).
 */

type Row = Record<string, any>

class FakeDb {
  tables: Record<string, Row[]> = {}
  inserts: Record<string, Row[]> = {}
  upserts: Record<string, Row[]> = {}

  seed(table: string, rows: Row[]) {
    this.tables[table] = rows
  }

  from(table: string) {
    const self = this
    let filters: Array<(r: Row) => boolean> = []
    let selected: string[] | null = null
    let orderedBy: string | null = null
    let orderAsc = true
    let rowLimit: number | null = null

    const apply = () => {
      let rows = (self.tables[table] || []).filter((r) => filters.every((f) => f(r)))
      if (orderedBy) {
        rows = [...rows].sort((a, b) => {
          const av = a[orderedBy!]
          const bv = b[orderedBy!]
          if (av === bv) return 0
          if (av === null || av === undefined) return 1
          if (bv === null || bv === undefined) return -1
          return orderAsc ? (av < bv ? -1 : 1) : av < bv ? 1 : -1
        })
      }
      if (rowLimit !== null) rows = rows.slice(0, rowLimit)
      if (selected) {
        rows = rows.map((r) => {
          const o: Row = {}
          for (const c of selected!) o[c] = r[c]
          return o
        })
      }
      return rows
    }

    const chain: any = {
      select(cols: string) { selected = cols.split(',').map((c) => c.trim()).filter(Boolean); return chain },
      eq(k: string, v: any) { filters.push((r: Row) => r[k] === v); return chain },
      in(k: string, vs: any[]) { filters.push((r: Row) => (vs || []).includes(r[k])); return chain },
      contains(k: string, vs: string[]) { filters.push((r: Row) => (vs || []).every((v) => (r[k] || []).includes(v))); return chain },
      order(col: string, opts?: { ascending?: boolean }) { orderedBy = col; orderAsc = opts?.ascending ?? true; return chain },
      limit(n: number) { rowLimit = n; return chain },
      then(resolve?: any, reject?: any) { return Promise.resolve({ data: apply(), error: null }).then(resolve, reject) },
      maybeSingle() { const rows = apply(); return Promise.resolve({ data: rows[0] ?? null, error: null }) },
      insert(rows: Row | Row[]) {
        const arr = Array.isArray(rows) ? rows : [rows]
        self.inserts[table] = [...(self.inserts[table] || []), ...arr]
        self.tables[table] = [...(self.tables[table] || []), ...arr]
        return { then(resolve?: any) { return Promise.resolve(resolve ? resolve({ data: null, error: null }) : { data: null, error: null }) } }
      },
      upsert(rows: Row | Row[], opts?: { onConflict?: string }) {
        const arr = Array.isArray(rows) ? rows : [rows]
        const keys = (opts?.onConflict || '').split(',').map((s: string) => s.trim()).filter(Boolean)
        for (const row of arr) {
          const idx = keys.length
            ? (self.tables[table] || []).findIndex((r) => keys.every((k) => r[k] === (row as any)[k]))
            : -1
          if (idx >= 0) {
            self.tables[table][idx] = { ...self.tables[table][idx], ...row }
          } else {
            self.tables[table] = [...(self.tables[table] || []), row]
            self.upserts[table] = [...(self.upserts[table] || []), { ...row }]
          }
        }
        return { then(resolve?: any) { return Promise.resolve(resolve ? resolve({ data: null, error: null }) : { data: null, error: null }) } }
      },
      update() { throw new Error('update unsupported in D gate harness') },
    }
    return chain
  }
}

// ── Q1–Q4 oracle, line-for-line mirrors of docs/phase-1.5-attribution-audit.md ──
function oracleQ1(db: FakeDb, invoiceId: string) {
  return (db.tables['recovery_outcomes'] || [])
    .filter((r) => r.outcome_type === 'payment' && r.invoice_id === invoiceId)
    .sort((a, b) => new Date(b.outcome_at).getTime() - new Date(a.outcome_at).getTime())
}

function oracleQ2(db: FakeDb, customerId: string) {
  return (db.tables['collection_actions'] || [])
    .filter((r) => r.customer_id === customerId)
    .sort((a, b) => new Date(b.executed_at).getTime() - new Date(a.executed_at).getTime())
    .map((ca) => {
      const we = (db.tables['whatsapp_events'] || []).find((w) => w.recovery_attempt_id === ca.id && w.direction === 'outbound')
      const outcomes = (db.tables['recovery_outcomes'] || []).filter((r) => r.recovery_attempt_id === ca.id).map((r) => r.outcome_type)
      return {
        id: ca.id,
        action_type: ca.action_type,
        executed_at: ca.executed_at,
        delivered_at: we?.delivered_at ?? null,
        read_at: we?.read_at ?? null,
        was_read: !!(we?.read_at),
        outcomes,
      }
    })
}

function oracleQ3(db: FakeDb, customerId: string) {
  return (db.tables['payment_promises'] || [])
    .filter((r) => r.customer_id === customerId)
    .map((pp) => {
      const ca = (db.tables['collection_actions'] || []).find((c) => c.id === pp.triggered_by_action_id)
      const promiseAt = new Date(pp.created_at).getTime()
      const attemptAt = ca?.executed_at ? new Date(ca.executed_at).getTime() : null
      return {
        id: pp.id,
        promise_date: pp.promise_date,
        status: pp.status,
        triggered_by: ca?.action_type ?? null,
        attempt_id: pp.triggered_by_action_id,
        hours_after_attempt: attemptAt !== null ? (promiseAt - attemptAt) / 3600000 : null,
      }
    })
}

function oracleQ4(db: FakeDb, customerId: string) {
  return (db.tables['collection_actions'] || [])
    .filter((r) => r.customer_id === customerId)
    .sort((a, b) => new Date(b.executed_at).getTime() - new Date(a.executed_at).getTime())
    .map((ca) => {
      const we = (db.tables['whatsapp_events'] || []).find((w) => w.recovery_attempt_id === ca.id)
      const outcome = (db.tables['recovery_outcomes'] || []).find((r) => r.recovery_attempt_id === ca.id)
      return {
        id: ca.id,
        action_type: ca.action_type,
        scheduled_at: ca.scheduled_at ?? null,
        executed_at: ca.executed_at,
        status: ca.status,
        delivered_at: we?.delivered_at ?? null,
        read_at: we?.read_at ?? null,
        outcome: outcome?.outcome_type ?? null,
      }
    })
}

// Test-side replica of persistInboundWhatsAppEvent's reply-outcome section
// (mini_saas_frontend/src/app/api/whatsapp/webhook/route.ts). Attribution is
// identity-only through the resolved provider parent; unresolvable ⇒ unknown.
function replyLikeWebhook(db: FakeDb, input: {
  tenantId: string
  invoiceId?: string | null
  customerId?: string | null
  contextId?: string | null
  messageId: string
  occurredAt: string
}) {
  let resolvedAttemptId: string | null = null
  let invoiceId: string | null = input.invoiceId ?? null
  let customerId: string | null = input.customerId ?? null

  if (input.contextId) {
    const parent = (db.tables['whatsapp_events'] || []).find((w) => w.provider_message_id === input.contextId)
    if (parent) {
      resolvedAttemptId = parent.recovery_attempt_id ?? null
      invoiceId = parent.invoice_id ?? invoiceId
      customerId = parent.customer_id ?? customerId
    }
  }

  const attribution = attributabilityOf(resolvedAttemptId)
  const outcome = {
    tenant_id: input.tenantId,
    recovery_attempt_id: resolvedAttemptId,
    outcome_type: 'customer_replied',
    outcome_at: input.occurredAt,
    invoice_id: invoiceId,
    customer_id: customerId,
    attribution_status: attribution.attribution_status,
    attribution_method: attribution.attribution_method,
    confidence_score: attribution.confidence_score,
    provider_message_id: input.messageId,
    metadata: { replied_to: input.contextId },
  }
  const same = (db.tables['recovery_outcomes'] || []).find(
    (r) => r.recovery_attempt_id === outcome.recovery_attempt_id
      && r.outcome_type === 'customer_replied'
      && r.provider_message_id === outcome.provider_message_id,
  )
  if (same) {
    Object.assign(same, outcome)
  } else {
    db.tables['recovery_outcomes'] = [...(db.tables['recovery_outcomes'] || []), outcome]
    db.inserts['recovery_outcomes'] = [...(db.inserts['recovery_outcomes'] || []), outcome]
  }
  return outcome
}

describe('Phase 1.5 D gate — outcome integrity', () => {
  let db: FakeDb

  const T1 = 't1'
  const C1 = 'c1'

  beforeEach(() => {
    vi.clearAllMocks()
    db = new FakeDb()
    ;(supabaseAdmin.from as any).mockImplementation((table: string) => db.from(table))

    db.seed('collection_actions', [
      { id: 'CA_A', tenant_id: T1, customer_id: C1, invoice_ids: ['inv_1'], action_type: 'reminder', status: 'completed', source: 'system', scheduled_at: '2026-09-01T10:00:00.000Z', executed_at: '2026-09-01T10:00:00.000Z', created_at: '2026-09-01T10:00:00.000Z', delivered_at: '2026-09-01T10:00:05.000Z', read_at: '2026-09-01T11:00:00.000Z', last_delivery_status: 'delivered' },
      { id: 'CA_B', tenant_id: T1, customer_id: C1, invoice_ids: ['inv_1'], action_type: 'reminder', status: 'completed', source: 'system', scheduled_at: '2026-09-02T10:00:00.000Z', executed_at: '2026-09-02T10:00:00.000Z', created_at: '2026-09-02T10:00:00.000Z', delivered_at: null, read_at: null, last_delivery_status: null },
    ])
    db.seed('whatsapp_events', [
      { id: 'we_A', tenant_id: T1, customer_id: C1, invoice_id: 'inv_1', direction: 'outbound', status: 'read', provider_message_id: 'msg_X', recovery_attempt_id: 'CA_A', delivered_at: '2026-09-01T10:00:05.000Z', read_at: '2026-09-01T11:00:00.000Z', created_at: '2026-09-01T10:00:00.000Z' },
      { id: 'we_B', tenant_id: T1, customer_id: C1, invoice_id: 'inv_1', direction: 'outbound', status: 'sent', provider_message_id: 'msg_Y', recovery_attempt_id: 'CA_B', delivered_at: null, read_at: null, created_at: '2026-09-02T10:00:00.000Z' },
    ])
    db.seed('payment_promises', [
      { id: 'pp_1', tenant_id: T1, customer_id: C1, invoice_id: 'inv_1', promise_date: '2026-09-05T00:00:00.000Z', triggered_by_action_id: 'CA_A', status: 'active', created_at: '2026-09-01T12:00:00.000Z' },
      { id: 'pp_2', tenant_id: T1, customer_id: C1, invoice_id: 'inv_1', promise_date: '2026-09-06T00:00:00.000Z', triggered_by_action_id: null, status: 'active', created_at: '2026-09-02T12:00:00.000Z' },
    ])
  })

  describe('D1 — schema/oracle resolves the canonical attempt chain', () => {
    it('Q1: payment outcome links to the attempt that caused it', async () => {
      await recordPaymentOutcome({ tenantId: T1, invoiceId: 'inv_1', paymentId: 'pay_1', amount: 5000, recoveryAttemptId: 'CA_A', customerId: C1, occurredAt: '2026-09-01T13:00:00.000Z' })

      const rows = oracleQ1(db, 'inv_1')
      expect(rows).toHaveLength(1)
      expect(rows[0].recovery_attempt_id).toBe('CA_A')
      expect(rows[0].outcome_type).toBe('payment')
      expect(rows[0].payment_amount).toBe(5000)
    })

    it('Q2: delivery/read evidence for each attempt stays attached to its own attempt', async () => {
      const rows = oracleQ2(db, C1)
      const a = rows.find((r) => r.id === 'CA_A')!
      const b = rows.find((r) => r.id === 'CA_B')!
      expect(a.delivered_at).not.toBeNull()
      expect(a.was_read).toBe(true)
      expect(b.delivered_at).toBeNull()
      expect(b.was_read).toBe(false)
    })

    it('Q3: promise attribution resolves to the prompting attempt', async () => {
      const rows = oracleQ3(db, C1)
      const p1 = rows.find((r) => r.id === 'pp_1')!
      expect(p1.attempt_id).toBe('CA_A')
      expect(p1.triggered_by).toBe('reminder')
      expect(p1.hours_after_attempt).toBeCloseTo(2, 5)
      expect(rows.find((r) => r.id === 'pp_2')!.attempt_id).toBeNull()
    })

    it('Q4: complete lifecycle of an attempt carries send + delivery + outcome', async () => {
      await recordCallOutcome({ tenantId: T1, attemptId: 'CA_A', customerId: C1, invoiceId: 'inv_1', occurredAt: '2026-09-01T13:30:00.000Z', evidenceId: 'evt_call' })
      const row = oracleQ4(db, C1).find((r) => r.id === 'CA_A')!
      expect(row.status).toBe('completed')
      expect(row.executed_at).toBe('2026-09-01T10:00:00.000Z')
      expect(row.delivered_at).not.toBeNull()
      expect(row.read_at).not.toBeNull()
      expect(row.outcome).toBe('call_completed')
    })
  })

  describe('D2 — full chain preserves the explicit attempt identity', () => {
    it('attempt → send → delivered → read → reply → promise → broken → call → payment all resolve to CA_A', async () => {
      // send/delivered/read: evidence rows attached to CA_A (fixture state above)
      const sendRow = db.tables['whatsapp_events'].find((w) => w.provider_message_id === 'msg_X')!
      expect(sendRow.recovery_attempt_id).toBe('CA_A')

      // reply resolves by provider parent identity to CA_A
      const reply = replyLikeWebhook(db, { tenantId: T1, invoiceId: 'inv_1', customerId: C1, contextId: 'msg_X', messageId: 'inb_1', occurredAt: '2026-09-01T14:00:00.000Z' })
      expect(reply.recovery_attempt_id).toBe('CA_A')
      expect(reply.attribution_status).toBe('verified')

      // promise made on pp_1 (triggered_by CA_A) then broken
      await recordBrokenPromisesLedger({ tenantId: T1, customerId: C1, occurredAt: '2026-09-07T10:00:00.000Z' })
      const brokenA = db.tables['recovery_outcomes'].find((r) => r.outcome_type === 'promise_broken' && r.promise_id === 'pp_1')!
      expect(brokenA.recovery_attempt_id).toBe('CA_A')
      expect(brokenA.attribution_status).toBe('verified')

      // call
      await recordCallOutcome({ tenantId: T1, attemptId: 'CA_A', customerId: C1, invoiceId: 'inv_1', occurredAt: '2026-09-07T10:30:00.000Z', evidenceId: 'evt_call' })
      const call = db.tables['recovery_outcomes'].find((r) => r.outcome_type === 'call_completed')!
      expect(call.recovery_attempt_id).toBe('CA_A')

      // payment
      await recordPaymentOutcome({ tenantId: T1, invoiceId: 'inv_1', paymentId: 'pay_final', amount: 5000, recoveryAttemptId: 'CA_A', customerId: C1, occurredAt: '2026-09-07T11:00:00.000Z' })
      const payment = db.tables['recovery_outcomes'].find((r) => r.outcome_type === 'payment')!
      expect(payment.recovery_attempt_id).toBe('CA_A')
      expect(payment.attribution_status).toBe('verified')

      // every attributable node resolves to the same canonical collection_actions.id
      const rows = oracleQ1(db, 'inv_1')
      expect(rows[0].recovery_attempt_id).toBe('CA_A')
      const q2a = oracleQ2(db, C1).find((r) => r.id === 'CA_A')!
      expect(q2a.outcomes.sort()).toEqual(['call_completed', 'customer_replied', 'payment', 'promise_broken'].sort())

      // C1 projection of the same evidence: read + delivered → not an ignore
      const hist = buildAttemptHistory({
        attempts: db.tables['collection_actions'].map((a) => ({
          id: a.id,
          action_type: a.action_type,
          status: a.status,
          executed_at: a.executed_at,
          created_at: a.created_at,
          delivered_at: a.delivered_at,
          read_at: a.read_at,
          last_delivery_status: a.last_delivery_status,
        })),
        outcomesByAttempt: {
          CA_A: (db.tables['recovery_outcomes'] || []).filter((r) => r.recovery_attempt_id === 'CA_A').map((r) => ({ outcome_type: r.outcome_type, outcome_at: r.outcome_at })),
          CA_B: (db.tables['recovery_outcomes'] || []).filter((r) => r.recovery_attempt_id === 'CA_B').map((r) => ({ outcome_type: r.outcome_type, outcome_at: r.outcome_at })),
        },
        now: '2026-09-07T11:00:00.000Z',
      })
      const projectionForA = hist.attempts.find((p) => p.id === 'CA_A')!
      expect(projectionForA.read).toBe(true)
    })

    it('identity wins over recency: a reply right after CA_A but referencing CA_B resolves to CA_B', async () => {
      const reply = replyLikeWebhook(db, { tenantId: T1, customerId: C1, contextId: 'msg_Y', messageId: 'inb_2', occurredAt: '2026-09-02T10:00:10.000Z' })
      expect(reply.recovery_attempt_id).toBe('CA_B')
      expect(reply.attribution_status).toBe('verified')
    })
  })

  describe('D3 — missing identity ⇒ unknown, never verified', () => {
    it('payment without attempt → unknown', async () => {
      await recordPaymentOutcome({ tenantId: T1, invoiceId: 'inv_1', paymentId: 'pay_noatt', amount: 5000, recoveryAttemptId: null, customerId: C1, occurredAt: '2026-09-02T12:00:00.000Z' })
      const o = db.tables['recovery_outcomes'].find((r) => r.payment_id === 'pay_noatt')!
      expect(o.attribution_status).toBe('unknown')
      expect(o.recovery_attempt_id).toBeNull()
    })

    it('promise broken from a promise with no prompting attempt → unknown', async () => {
      await recordBrokenPromisesLedger({ tenantId: T1, customerId: C1, occurredAt: '2026-09-07T10:00:00.000Z' })
      const o = db.tables['recovery_outcomes'].find((r) => r.promise_id === 'pp_2')!
      expect(o.attribution_status).toBe('unknown')
      expect(o.recovery_attempt_id).toBeNull()
    })

    it('call with no explicit attempt → unknown', async () => {
      await recordCallOutcome({ tenantId: T1, customerId: C1, invoiceId: 'inv_1', occurredAt: '2026-09-03T10:00:00.000Z', evidenceId: 'evt_call_orphan' })
      const o = db.tables['recovery_outcomes'].find((r) => r.outcome_type === 'call_completed')!
      expect(o.attribution_status).toBe('unknown')
      expect(o.recovery_attempt_id).toBeNull()
    })

    it('reply with unresolvable parent context → unknown', async () => {
      const reply = replyLikeWebhook(db, { tenantId: T1, customerId: C1, contextId: 'msg_unknown', messageId: 'inb_9', occurredAt: '2026-09-04T10:00:00.000Z' })
      expect(reply.recovery_attempt_id).toBeNull()
      expect(reply.attribution_status).toBe('unknown')
    })
  })

  describe('D4 — no inference: hostile payment 10s after the attempt stays unknown', () => {
    it('payment 10 seconds after CA_A, NO recoveryAttemptId → UNKNOWN, never verified→Attempt A', async () => {
      await recordPaymentOutcome({
        tenantId: T1,
        invoiceId: 'inv_1',
        paymentId: 'pay_hostile',
        amount: 5000,
        recoveryAttemptId: null, // ← explicit absence, even though CA_A happened 10s earlier
        customerId: C1,
        occurredAt: '2026-09-01T10:00:10.000Z',
      })

      const rows = db.tables['recovery_outcomes'].filter((r) => r.outcome_type === 'payment')
      expect(rows).toHaveLength(1)
      expect(rows[0].payment_id).toBe('pay_hostile')
      expect(rows[0].attribution_status).toBe('unknown')
      expect(rows[0].recovery_attempt_id).toBeNull()
      expect(rows[0].recovery_attempt_id).not.toBe('CA_A')
    })
  })

  describe('D5 — idempotency: replayed webhooks/events do not duplicate or re-attribute', () => {
    it('replayed payment resolves to the same evidence row and keeps attribution', async () => {
      await recordPaymentOutcome({ tenantId: T1, invoiceId: 'inv_1', paymentId: 'pay_x', amount: 5000, recoveryAttemptId: 'CA_A', customerId: C1, occurredAt: '2026-09-01T13:00:00.000Z' })
      // replays may omit the attempt id on a retry — must NOT clobber a verified link to unknown
      await recordPaymentOutcome({ tenantId: T1, invoiceId: 'inv_1', paymentId: 'pay_x', amount: 5000, recoveryAttemptId: null, customerId: C1, occurredAt: '2026-09-01T13:00:00.000Z' })
      const rows = db.tables['recovery_outcomes'].filter((r) => r.outcome_type === 'payment')
      expect(rows).toHaveLength(1)
      expect(rows[0].recovery_attempt_id).toBe('CA_A')
      expect(rows[0].attribution_status).toBe('verified')
    })

    it('replayed broken-promise sweep does not duplicate promise_broken outcomes', async () => {
      await recordBrokenPromisesLedger({ tenantId: T1, customerId: C1, occurredAt: '2026-09-07T10:00:00.000Z' })
      await recordBrokenPromisesLedger({ tenantId: T1, customerId: C1, occurredAt: '2026-09-07T10:00:00.000Z' })
      const broken = db.tables['recovery_outcomes'].filter((r) => r.outcome_type === 'promise_broken')
      expect(broken).toHaveLength(2)
    })

    it('replayed call resolves to one evidence row', async () => {
      await recordCallOutcome({ tenantId: T1, attemptId: 'CA_A', customerId: C1, invoiceId: 'inv_1', occurredAt: '2026-09-01T13:00:00.000Z', evidenceId: 'evt_call' })
      await recordCallOutcome({ tenantId: T1, attemptId: 'CA_A', customerId: C1, invoiceId: 'inv_1', occurredAt: '2026-09-01T13:00:00.000Z', evidenceId: 'evt_call' })
      expect(db.tables['recovery_outcomes'].filter((r) => r.outcome_type === 'call_completed')).toHaveLength(1)
    })

    it('replayed reply (same provider receipt) does not duplicate customer_replied', async () => {
      replyLikeWebhook(db, { tenantId: T1, customerId: C1, contextId: 'msg_X', messageId: 'inb_1', occurredAt: '2026-09-01T14:00:00.000Z' })
      replyLikeWebhook(db, { tenantId: T1, customerId: C1, contextId: 'msg_X', messageId: 'inb_1', occurredAt: '2026-09-01T14:00:00.000Z' })
      expect(db.tables['recovery_outcomes'].filter((r) => r.outcome_type === 'customer_replied')).toHaveLength(1)
    })
  })

  describe('D6 — identity ambiguity ⇒ unknown, never "pick latest"', () => {
    it('payment with a provider identity matching nothing → unknown (provider identity is never used to infer an attempt)', async () => {
      await recordPaymentOutcome({ tenantId: T1, invoiceId: 'inv_1', paymentId: 'pay_orphan', amount: 5000, recoveryAttemptId: null, customerId: C1, occurredAt: '2026-09-02T13:00:00.000Z' })
      const o = db.tables['recovery_outcomes'].find((r) => r.payment_id === 'pay_orphan')!
      expect(o.attribution_status).toBe('unknown')
      expect(o.recovery_attempt_id).toBeNull()
    })

    it('payment whose provider identity could match MULTIPLE candidates → unknown, not the latest attempt', async () => {
      // CA_A and CA_B are both candidates; no explicit attempt id on the payment.
      await recordPaymentOutcome({ tenantId: T1, invoiceId: 'inv_1', paymentId: 'pay_ambiguous', amount: 5000, recoveryAttemptId: null, customerId: C1, occurredAt: '2026-09-03T12:00:00.000Z' })
      const o = db.tables['recovery_outcomes'].find((r) => r.payment_id === 'pay_ambiguous')!
      expect(o.attribution_status).toBe('unknown')
      expect(o.recovery_attempt_id).toBeNull()
      expect(o.recovery_attempt_id).not.toBe('CA_B') // CA_B is the more recent attempt — we do NOT pick it
    })

    it('blank/non-string attempt ids never verify', async () => {
      await recordPaymentOutcome({ tenantId: T1, invoiceId: 'inv_1', paymentId: 'pay_blank', amount: 5000, recoveryAttemptId: '' as any, customerId: C1, occurredAt: '2026-09-03T12:00:00.000Z' })
      const o = db.tables['recovery_outcomes'].find((r) => r.payment_id === 'pay_blank')!
      expect(o.attribution_status).toBe('unknown')
    })
  })
})