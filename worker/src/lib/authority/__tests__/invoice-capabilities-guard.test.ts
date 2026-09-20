import { describe, it, expect, vi, beforeEach } from 'vitest'
import { invoiceMarkPaid } from '../invoice-capabilities'

// B-05a: the single-statement conditional UPDATE is the real atomicity
// enforcer (Postgres serializes concurrent writers on the row lock). These
// tests verify branching, query shape, and convergence semantics against a
// serialized mock — true parallel-isolation proof belongs to staging
// verification against a live database, not to unit mocks.
const state = vi.hoisted(() => ({
  updateResult: { data: [{ id: 'inv1' }], error: null } as { data: any[] | null; error: any },
  calls: [] as Array<[string, ...any[]]>,
}))

vi.mock('../../billzo/supabase-admin', () => {
  const select = (...a: any[]) => {
    state.calls.push(['select', ...a])
    return Promise.resolve(state.updateResult)
  }
  const or = (...a: any[]) => {
    state.calls.push(['or', ...a])
    return { select }
  }
  const eq = (...a: any[]) => {
    state.calls.push(['eq', ...a])
    return { eq, or }
  }
  const update = (...a: any[]) => {
    state.calls.push(['update', ...a])
    return { eq }
  }
  return { supabaseAdmin: { from: vi.fn(() => ({ update })) } }
})

function intent(payload: Record<string, unknown>) {
  return {
    intentId: 'i1',
    intentType: 'invoice.mark_paid',
    intentVersion: 1,
    tenantId: 't1',
    actor: 'test',
    source: 'app',
    timestamp: new Date().toISOString(),
    causationId: null,
    correlationId: null,
    payload,
  } as any
}

beforeEach(() => {
  state.calls = []
  state.updateResult = { data: [{ id: 'inv1' }], error: null }
})

describe('invoice.mark_paid convergence guard (B-05a)', () => {
  it('applies when the row is not yet at target state', async () => {
    const res: any = await (invoiceMarkPaid.execute as any)(intent({ invoiceId: 'inv1', status: 'paid', paidAmount: 100 }))
    expect(res.success).toBe(true)
    expect(res.data).toMatchObject({ invoiceId: 'inv1', applied: true })
  })

  it('scopes the write by tenant and converges on target state', async () => {
    await (invoiceMarkPaid.execute as any)(intent({ invoiceId: 'inv1', status: 'paid', paidAmount: 100 }))
    const eqCalls = state.calls.filter(([op]) => op === 'eq')
    expect(eqCalls).toContainEqual(['eq', 'id', 'inv1'])
    expect(eqCalls).toContainEqual(['eq', 'tenant_id', 't1'])
    const orCalls = state.calls.filter(([op]) => op === 'or')
    expect(orCalls).toHaveLength(1)
    expect(String(orCalls[0][1])).toContain('paid_amount.neq.100')
    expect(String(orCalls[0][1])).toContain('status.neq.paid')
  })

  it('returns an idempotent no-op (no throw) when already applied', async () => {
    state.updateResult = { data: [], error: null }
    const res: any = await (invoiceMarkPaid.execute as any)(intent({ invoiceId: 'inv1', status: 'paid', paidAmount: 100 }))
    expect(res.success).toBe(true)
    expect(res.data).toMatchObject({ invoiceId: 'inv1', applied: false })
  })

  it('parallel duplicates converge to exactly one applied mutation', async () => {
    // Serialized mock: first writer changes the row, second sees target state.
    const { supabaseAdmin } = await import('../../billzo/supabase-admin')
    void supabaseAdmin
    state.updateResult = { data: [{ id: 'inv1' }], error: null }
    const first: any = (invoiceMarkPaid.execute as any)(intent({ invoiceId: 'inv1', status: 'paid', paidAmount: 100 }))
    state.updateResult = { data: [], error: null }
    const second: any = (invoiceMarkPaid.execute as any)(intent({ invoiceId: 'inv1', status: 'paid', paidAmount: 100 }))
    const [r1, r2] = await Promise.all([first, second])
    const applied = [r1.data.applied, r2.data.applied].filter(Boolean)
    expect(r1.success).toBe(true)
    expect(r2.success).toBe(true)
    expect(applied).toHaveLength(1)
  })

  it('fails closed on non-finite paidAmount without touching the DB', async () => {
    const res: any = await (invoiceMarkPaid.execute as any)(intent({ invoiceId: 'inv1', status: 'paid', paidAmount: NaN }))
    expect(res.success).toBe(false)
    expect(state.calls.filter(([op]) => op === 'update')).toHaveLength(0)
  })

  it('sanitizes the status interpolation (falls back to paid)', async () => {
    await (invoiceMarkPaid.execute as any)(
      intent({ invoiceId: 'inv1', status: 'paid,x', paidAmount: 100 }),
    )
    const orCalls = state.calls.filter(([op]) => op === 'or')
    expect(String(orCalls[0][1])).toContain('status.neq.paid')
    expect(String(orCalls[0][1])).not.toContain('paid,x')
  })

  it('surfaces DB errors as failure', async () => {
    state.updateResult = { data: null, error: { message: 'boom' } }
    const res: any = await (invoiceMarkPaid.execute as any)(intent({ invoiceId: 'inv1', status: 'paid', paidAmount: 100 }))
    expect(res.success).toBe(false)
    expect(res.error).toBe('boom')
  })
})
