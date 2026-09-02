import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../billzo/supabase-admin', () => ({
  supabaseAdmin: { from: vi.fn() },
}))

import { supabaseAdmin } from '../../billzo/supabase-admin'
import { recordCallOutcome } from '../call-outcome-ledger'

type Row = Record<string, any>

class FakeDb {
  tables: Record<string, Row[]> = {}
  inserts: Record<string, Row[]> = {}

  from(table: string) {
    const self = this
    let filters: Array<(r: Row) => boolean> = []
    const apply = () => (self.tables[table] || []).filter((r) => filters.every((f) => f(r)))

    const chain: any = {
      select() { return chain },
      eq(k: string, v: any) { filters.push((r: Row) => r[k] === v); return chain },
      limit() { return chain },
      then(resolve?: any) { return Promise.resolve({ data: apply(), error: null }).then(resolve) },
      maybeSingle() { const rows = apply(); return Promise.resolve({ data: rows[0] ?? null, error: null }) },
      insert(rows: Row | Row[]) {
        const arr = Array.isArray(rows) ? rows : [rows]
        self.tables[table] = [...(self.tables[table] || []), ...arr]
        self.inserts[table] = [...(self.inserts[table] || []), ...arr]
        return { then(resolve?: any) { return Promise.resolve({ data: null, error: null }).then(resolve) } }
      },
      upsert(rows: Row | Row[], opts?: { onConflict?: string }) {
        const arr = Array.isArray(rows) ? rows : [rows]
        const keys = (opts?.onConflict || '').split(',').map((s: string) => s.trim())
        for (const row of arr) {
          const idx = keys.length ? self.tables[table].findIndex((r) => keys.every((k) => r[k] === (row as any)[k])) : -1
          if (idx >= 0) self.tables[table][idx] = { ...self.tables[table][idx], ...row }
          else { self.tables[table] = [...(self.tables[table] || []), row]; self.inserts[table] = [...(self.inserts[table] || []), { ...row }] }
        }
        return { then(resolve?: any) { return Promise.resolve({ data: null, error: null }).then(resolve) } }
      },
    }
    return chain
  }
}

describe('call outcome ledger — C0', () => {
  let db: FakeDb
  const NOW = '2026-09-15T10:00:00.000Z'

  beforeEach(() => {
    vi.clearAllMocks()
    db = new FakeDb()
    ;(supabaseAdmin.from as any).mockImplementation((table: string) => db.from(table))
  })

  it('call with explicit attempt → VERIFIED/explicit/1 against that attempt', async () => {
    const res = await recordCallOutcome({
      tenantId: 't1',
      attemptId: 'CA_7',
      customerId: 'c1',
      invoiceId: 'inv_1',
      occurredAt: NOW,
      evidenceId: 'evt_101',
    })

    const outcome = (db.tables['recovery_outcomes'] || [])[0]
    expect(res).toEqual({ attemptId: 'CA_7', attributionStatus: 'verified' })
    expect(outcome.outcome_type).toBe('call_completed')
    expect(outcome.recovery_attempt_id).toBe('CA_7')
    expect(outcome.invoice_id).toBe('inv_1')
    expect(outcome.customer_id).toBe('c1')
    expect(outcome.attribution_status).toBe('verified')
    expect(outcome.attribution_method).toBe('explicit')
    expect(outcome.confidence_score).toBe(1)
    expect(outcome.outcome_at).toBe(NOW)
  })

  it('call without an attributable attempt → recorded UNKNOWN, never guessed', async () => {
    const res = await recordCallOutcome({
      tenantId: 't1',
      attemptId: null,
      customerId: 'c1',
      invoiceId: 'inv_1',
      occurredAt: NOW,
    })

    const outcome = (db.tables['recovery_outcomes'] || [])[0]
    expect(res).toEqual({ attemptId: null, attributionStatus: 'unknown' })
    // Evidence is still a first-class outcome — only its causality is unknown.
    expect(outcome.outcome_type).toBe('call_completed')
    expect(outcome.recovery_attempt_id).toBeNull()
    expect(outcome.attribution_status).toBe('unknown')
    expect(outcome.attribution_method).toBeNull()
    expect(outcome.confidence_score).toBeNull()
  })

  it('blank-string attempt id is treated as no identity → UNKNOWN', async () => {
    await recordCallOutcome({ tenantId: 't1', attemptId: '', customerId: 'c1', invoiceId: 'inv_1', occurredAt: NOW })

    const outcome = (db.tables['recovery_outcomes'] || [])[0]
    expect(outcome.recovery_attempt_id).toBeNull()
    expect(outcome.attribution_status).toBe('unknown')
  })

  it('non-string attempt id is treated as no identity → UNKNOWN', async () => {
    await recordCallOutcome({ tenantId: 't1', attemptId: 0 as any, customerId: 'c1', invoiceId: 'inv_1', occurredAt: NOW })

    const outcome = (db.tables['recovery_outcomes'] || [])[0]
    expect(outcome.recovery_attempt_id).toBeNull()
    expect(outcome.attribution_status).toBe('unknown')
  })

  it('a retried outbox event resolves to the same evidence row (retry-idempotent)', async () => {
    for (let i = 0; i < 2; i++) {
      await recordCallOutcome({
        tenantId: 't1',
        attemptId: 'CA_7',
        customerId: 'c1',
        invoiceId: 'inv_1',
        occurredAt: NOW,
        evidenceId: 'evt_101',
      })
    }

    expect(db.tables['recovery_outcomes'] || []).toHaveLength(1)
    expect((db.tables['recovery_outcomes'] || [])[0].provider_message_id).toBe('evt_101')
    expect((db.tables['recovery_outcomes'] || [])[0].recovery_attempt_id).toBe('CA_7')
  })
})