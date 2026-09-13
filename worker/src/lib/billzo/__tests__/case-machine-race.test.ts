import { describe, it, expect, vi, beforeEach } from 'vitest'

// Isolate: the handler imports supabaseAdmin, which must never hit the network.
vi.mock('../../billzo/supabase-admin', () => ({
  supabaseAdmin: { from: vi.fn() },
}))

import { tryHandleRecoveryCaseStateMachine, deterministicCaseId } from '../../recovery/case-machine-handler'

type Row = Record<string, any>

// In-memory supabase-shaped DB. Operations run at await-time (in .then), so
// concurrent handler calls are truly serialized by the same single-threaded
// scheduling the production code runs under.
class FakeDb {
  tables: Record<string, Row[]> = {}
  upsertCalls: Record<string, number> = {}
  failUpsertOnce: { table: string; id: string } | null = null

  seed(table: string, rows: Row[]) {
    this.tables[table] = rows
  }

  from(table: string) {
    const self = this
    const filters: Array<(r: Row) => boolean> = []
    let projectionColumns: string[] | null = null
    let pendingOp: { kind: string; rows?: Row | Row[]; options?: any; set?: Row } | null = null

    const project = (r: Row): Row => {
      if (!projectionColumns) return r
      const out: Row = {}
      for (const c of projectionColumns) out[c] = r[c]
      return out
    }
    const filterRows = (src: Row[]) => src.filter((r) => filters.every((f) => f(r)))

    const chain: any = {
      select(cols: string) {
        projectionColumns = cols.split(',').map((c: string) => c.trim())
        return chain
      },
      eq(k: string, v: any) {
        filters.push((r) => r[k] === v)
        return chain
      },
      limit() {
        return chain
      },
      order() {
        return chain
      },
      maybeSingle() {
        return chain
      },
      single() {
        return chain
      },
      insert(rows: Row | Row[], options?: any) {
        pendingOp = { kind: 'insert', rows, options }
        return chain
      },
      upsert(rows: Row | Row[], options?: any) {
        pendingOp = { kind: 'upsert', rows, options }
        return chain
      },
      update(set: Row) {
        pendingOp = { kind: 'update', set }
        return chain
      },
      delete() {
        pendingOp = { kind: 'delete' }
        return chain
      },
      then(resolve?: any, reject?: any) {
        return Promise.resolve().then(() => this._exec(table)).then(resolve, reject)
      },
    }

    chain._exec = (t: string) => this._exec(t, { filters, projectionColumns, pendingOp })
    return chain
  }

  private _exec(
    table: string,
    ctx: { filters: Array<(r: Row) => boolean>; projectionColumns: string[] | null; pendingOp: any },
  ): Promise<{ data: Row[] | Row | null; error: any }> {
    const rows = ctx.filters.length ? (this.tables[table] || []).filter((r) => ctx.filters.every((f) => f(r))) : this.tables[table] || []
    const op = ctx.pendingOp
    const project = (r: Row): Row => {
      if (!ctx.projectionColumns) return r
      const out: Row = {}
      for (const c of ctx.projectionColumns) out[c] = r[c]
      return out
    }

    if (!op) {
      // Pure read
      const landed = rows.length === 0 ? [] : rows
      return Promise.resolve({ data: landed, error: null })
    }

    if (op.kind === 'update') {
      for (const r of rows) Object.assign(r, op.set)
      return Promise.resolve({ data: [], error: null })
    }

    if (op.kind === 'delete') {
      const remaining = (this.tables[table] || []).filter((r) => !ctx.filters.every((f) => f(r)))
      this.tables[table] = remaining
      return Promise.resolve({ data: [], error: null })
    }

    if (op.kind === 'insert') {
      const arr = Array.isArray(op.rows) ? op.rows : [op.rows]
      if (op.options?.onConflict && op.options.ignoreDuplicates) {
        const keys = (op.options.onConflict as string).split(',').map((k: string) => k.trim())
        const dupe = arr.some((row: Row) =>
          (this.tables[table] || []).some((existing) => keys.every((k) => existing[k] === row[k])),
        )
        if (dupe) return Promise.resolve({ data: [], error: null })
      }
      this.tables[table] = [...(this.tables[table] || []), ...arr]
      return Promise.resolve({ data: [], error: null })
    }

    if (op.kind === 'upsert') {
      const arr = Array.isArray(op.rows) ? op.rows : [op.rows]
      this.upsertCalls[table] = (this.upsertCalls[table] || 0) + 1
      const options = op.options || {}

      if (options.onConflict && options.ignoreDuplicates) {
        const keys = (options.onConflict as string).split(',').map((k: string) => k.trim())
        const dupe = arr.some((row: Row) =>
          (this.tables[table] || []).some((existing) => keys.every((k) => existing[k] === row[k])),
        )
        if (dupe) return Promise.resolve({ data: [], error: null })
        const inserted = arr.map(project)
        this.tables[table] = [...(this.tables[table] || []), ...arr]
        return Promise.resolve({ data: inserted, error: null })
      }

      // Upsert by id (recovery_cases) — ON CONFLICT (id) DO UPDATE.
      if (options.onConflict === 'id') {
        const row = arr[0]
        if (this.failUpsertOnce && this.failUpsertOnce.table === table && this.failUpsertOnce.id === row.id) {
          this.failUpsertOnce = null
          return Promise.resolve({ data: [], error: new Error('simulated upsert failure') })
        }
        const idx = (this.tables[table] || []).findIndex((existing) => existing.id === row.id)
        if (idx === -1) this.tables[table] = [...(this.tables[table] || []), row]
        else this.tables[table][idx] = { ...this.tables[table][idx], ...row }
        return Promise.resolve({ data: [row], error: null })
      }

      // Plain upsert (payment_promises) — treat as insert.
      this.tables[table] = [...(this.tables[table] || []), ...arr]
      return Promise.resolve({ data: [], error: null })
    }

    return Promise.resolve({ data: null, error: null })
  }
}

function invoiceCreatedEvent(id: string, customerId: string, amount: number) {
  return {
    type: 'invoice.created',
    id,
    entityId: `inv_${id}`,
    tenantId: 'tenant_1',
    payload: { customerId, amount },
    created_at: '2026-09-10T09:00:00.000Z',
  }
}

describe('B-05: recovery_case_event_consumptions race condition', () => {
  let db: FakeDb

  beforeEach(() => {
    db = new FakeDb()
  })

  it('two concurrent handlers for the SAME event mutate the case exactly once', async () => {
    const event = invoiceCreatedEvent('evt_1', 'cust_A', 5000)

    await Promise.all([
      tryHandleRecoveryCaseStateMachine(event, db as any),
      tryHandleRecoveryCaseStateMachine(event, db as any),
    ])

    expect(db.upsertCalls['recovery_cases']).toBe(1)
    expect(db.tables['recovery_cases']).toHaveLength(1)
    expect(db.tables['recovery_case_events']).toHaveLength(1)
    expect(db.tables['recovery_case_event_consumptions']).toHaveLength(1)
    expect(db.tables['recovery_cases']![0].id).toBe(deterministicCaseId('tenant_1', 'cust_A'))
  })

  it('new-case events use a deterministic case id so concurrent claims collide', async () => {
    const a = deterministicCaseId('tenant_1', 'cust_A')
    const b = deterministicCaseId('tenant_1', 'cust_B')
    const same = deterministicCaseId('tenant_1', 'cust_A')

    expect(a).toBe(same)
    expect(a).not.toBe(b)
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('a replayed event after completion is idempotently skipped (no second mutation)', async () => {
    const event = invoiceCreatedEvent('evt_1', 'cust_A', 5000)

    await tryHandleRecoveryCaseStateMachine(event, db as any)
    const versionAfterFirst = db.tables['recovery_case_events']!.length

    await tryHandleRecoveryCaseStateMachine(event, db as any)

    expect(db.upsertCalls['recovery_cases']).toBe(1)
    expect(db.tables['recovery_case_events']).toHaveLength(versionAfterFirst)
    expect(db.tables['recovery_case_event_consumptions']).toHaveLength(1)
  })

  it('distinct concurrent events for the same customer both process (dedup is per-event)', async () => {
    await Promise.all([
      tryHandleRecoveryCaseStateMachine(invoiceCreatedEvent('evt_1', 'cust_A', 5000), db as any),
      tryHandleRecoveryCaseStateMachine(invoiceCreatedEvent('evt_2', 'cust_A', 2500), db as any),
    ])

    expect(db.tables['recovery_case_events']).toHaveLength(2)
    expect(db.tables['recovery_case_event_consumptions']).toHaveLength(2)
    expect(db.tables['recovery_cases']).toHaveLength(1)
  })

  it('releases the claim on upsert failure so a retry can reprocess the event', async () => {
    const event = invoiceCreatedEvent('evt_retry', 'cust_R', 1000)
    db.failUpsertOnce = { table: 'recovery_cases', id: deterministicCaseId('tenant_1', 'cust_R') }

    await tryHandleRecoveryCaseStateMachine(event, db as any)

    // Claim released on failure -> a second attempt succeeds and leaves exactly one log row.
    expect(db.tables['recovery_case_event_consumptions']).toHaveLength(0)

    await tryHandleRecoveryCaseStateMachine(event, db as any)

    expect(db.tables['recovery_cases']).toHaveLength(1)
    expect(db.tables['recovery_case_events']).toHaveLength(1)
    expect(db.tables['recovery_case_event_consumptions']).toHaveLength(1)
  })

  it('unsupported event types are ignored without claiming', async () => {
    const event = { ...invoiceCreatedEvent('evt_x', 'cust_A', 5000), type: 'invoice.deleted' }

    await tryHandleRecoveryCaseStateMachine(event, db as any)

    expect(db.tables['recovery_case_event_consumptions'] ?? []).toHaveLength(0)
    expect(db.upsertCalls['recovery_cases']).toBeUndefined()
  })
})