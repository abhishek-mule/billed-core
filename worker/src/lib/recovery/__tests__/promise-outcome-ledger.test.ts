import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../billzo/supabase-admin', () => ({
  supabaseAdmin: { from: vi.fn() },
}))

import { supabaseAdmin } from '../../billzo/supabase-admin'
import { recordPromiseKeepIfHonored, recordBrokenPromisesLedger } from '../promise-outcome-ledger'

type Row = Record<string, any>

class FakeDb {
  tables: Record<string, Row[]> = {}
  inserts: Record<string, Row[]> = {}

  seed(table: string, rows: Row[]) {
    this.tables[table] = rows
  }

  from(table: string) {
    const self = this
    const filters: Array<(r: Row) => boolean> = []
    const selected: string[] = []
    const project = (r: Row) => {
      const out: Row = {}
      for (const c of selected) out[c] = r[c]
      if (selected.length === 0) return r
      return out
    }
    const apply = () => (self.tables[table] || []).filter((r) => filters.every((f) => f(r))).map(project)

    const chain: any = {
      select(cols: string) { selected.push(...cols.split(',').map((c: string) => c.trim())); return chain },
      eq(k: string, v: any) { filters.push((r) => r[k] === v); return chain },
      limit() { return chain },
      then(resolve?: any) { return Promise.resolve({ data: apply(), error: null }).then(resolve) },
      maybeSingle() {
        const rows = apply()
        return Promise.resolve({ data: rows[0] ?? null, error: null })
      },
      insert(rows: Row | Row[]) {
        const arr = Array.isArray(rows) ? rows : [rows]
        self.inserts[table] = [...(self.inserts[table] || []), ...arr]
        return { then(resolve?: any) { return Promise.resolve(resolve ? resolve({ data: null, error: null }) : { data: null, error: null }) } }
      },
    }
    return chain
  }
}

describe('promise outcome ledger — B2', () => {
  let db: FakeDb
  const NOW = '2026-09-15T10:00:00.000Z'

  beforeEach(() => {
    vi.clearAllMocks()
    db = new FakeDb()
    ;(supabaseAdmin.from as any).mockImplementation((table: string) => db.from(table))
  })

  it('promise_kept → VERIFIED against the attempt that prompted the promise, when paid on time', async () => {
    db.seed('payment_promises', [
      { id: 'p1', tenant_id: 't1', customer_id: 'c1', invoice_id: 'inv_1', promise_date: '2026-09-20T00:00:00.000Z', triggered_by_action_id: 'CA_1', status: 'active' },
    ])

    await recordPromiseKeepIfHonored({ tenantId: 't1', invoiceId: 'inv_1', customerId: 'c1', paymentAmount: 100, occurredAt: NOW })

    const outcome = db.inserts['recovery_outcomes']?.[0]
    expect(outcome.outcome_type).toBe('promise_kept')
    expect(outcome.recovery_attempt_id).toBe('CA_1')
    expect(outcome.promise_id).toBe('p1')
    expect(outcome.attribution_status).toBe('verified')
    expect(outcome.attribution_method).toBe('explicit')
    expect(outcome.confidence_score).toBe(1)
  })

  it('promise_kept with no originating attempt → recorded UNKNOWN, never guessed', async () => {
    db.seed('payment_promises', [
      { id: 'p2', tenant_id: 't1', customer_id: 'c1', invoice_id: 'inv_1', promise_date: '2026-09-20T00:00:00.000Z', triggered_by_action_id: null, status: 'active' },
    ])

    await recordPromiseKeepIfHonored({ tenantId: 't1', invoiceId: 'inv_1', customerId: 'c1', paymentAmount: 100, occurredAt: NOW })

    const outcome = db.inserts['recovery_outcomes']?.[0]
    expect(outcome.recovery_attempt_id).toBeNull()
    expect(outcome.attribution_status).toBe('unknown')
    expect(outcome.attribution_method).toBeNull()
  })

  it('promise_kept only when honored on/before the promised date', async () => {
    db.seed('payment_promises', [
      { id: 'p3', tenant_id: 't1', customer_id: 'c1', invoice_id: 'inv_1', promise_date: '2026-08-01T00:00:00.000Z', triggered_by_action_id: 'CA_3', status: 'active' },
    ])

    await recordPromiseKeepIfHonored({ tenantId: 't1', invoiceId: 'inv_1', customerId: 'c1', paymentAmount: 100, occurredAt: NOW })

    expect(db.inserts['recovery_outcomes'] ?? []).toHaveLength(0)
  })

  it('promise_kept is idempotent per (promise, outcome)', async () => {
    db.seed('payment_promises', [
      { id: 'p4', tenant_id: 't1', customer_id: 'c1', invoice_id: 'inv_1', promise_date: '2026-09-20T00:00:00.000Z', triggered_by_action_id: 'CA_4', status: 'active' },
    ])
    db.seed('recovery_outcomes', [{ id: 'ro1', promise_id: 'p4', outcome_type: 'promise_kept' }])

    await recordPromiseKeepIfHonored({ tenantId: 't1', invoiceId: 'inv_1', customerId: 'c1', paymentAmount: 100, occurredAt: NOW })
    expect(db.inserts['recovery_outcomes'] ?? []).toHaveLength(0)
  })

  it('promise_broken → VERIFIED against the prompting attempt for each active promise', async () => {
    db.seed('payment_promises', [
      { id: 'p5', tenant_id: 't1', customer_id: 'c1', invoice_id: 'inv_1', triggered_by_action_id: 'CA_5', status: 'active' },
      { id: 'p6', tenant_id: 't1', customer_id: 'c1', invoice_id: 'inv_1', triggered_by_action_id: null, status: 'active' },
    ])

    await recordBrokenPromisesLedger({ tenantId: 't1', customerId: 'c1', occurredAt: NOW })

    const outcomes = db.inserts['recovery_outcomes'] ?? []
    expect(outcomes).toHaveLength(2)
    const verified = outcomes.find((o) => o.recovery_attempt_id === 'CA_5')!
    const unknown = outcomes.find((o) => o.recovery_attempt_id === null)!
    expect(verified.outcome_type).toBe('promise_broken')
    expect(verified.attribution_status).toBe('verified')
    expect(verified.promise_id).toBe('p5')
    expect(unknown.attribution_status).toBe('unknown')
    expect(unknown.promise_id).toBe('p6')
  })

  it('promise_broken is idempotent per promise', async () => {
    db.seed('payment_promises', [
      { id: 'p7', tenant_id: 't1', customer_id: 'c1', invoice_id: 'inv_1', triggered_by_action_id: 'CA_7', status: 'active' },
    ])
    db.seed('recovery_outcomes', [{ id: 'ro2', promise_id: 'p7', outcome_type: 'promise_broken' }])

    await recordBrokenPromisesLedger({ tenantId: 't1', customerId: 'c1', occurredAt: NOW })
    expect(db.inserts['recovery_outcomes'] ?? []).toHaveLength(0)
  })
})