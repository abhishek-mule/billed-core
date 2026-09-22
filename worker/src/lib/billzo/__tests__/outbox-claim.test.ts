import { describe, it, expect, vi, beforeEach } from 'vitest'
import { claimOutboxEvent } from '../outbox'

// B-05b: the single-statement conditional UPDATE is the real atomicity
// enforcer (Postgres serializes writers on the row). These tests verify
// branching, query shape, and the silent-drop contract against a serialized
// mock — true parallel-isolation proof belongs to staging verification.
const state = vi.hoisted(() => ({
  updateResult: { data: [{ id: 'x' }] as any[] | null, error: null as any },
  calls: [] as Array<[string, ...any[]]>,
}))

vi.mock('../supabase-admin', () => {
  const select = (...a: any[]) => {
    state.calls.push(['select', ...a])
    return Promise.resolve(state.updateResult)
  }
  const eq = (...a: any[]) => {
    state.calls.push(['eq', ...a])
    return { eq, select }
  }
  const update = (...a: any[]) => {
    state.calls.push(['update', ...a])
    return { eq }
  }
  return { supabaseAdmin: { from: vi.fn(() => ({ update })) } }
})

const ROW = {
  id: 'evt1',
  causation_id: null,
  correlation_id: 'corr1',
  type: 'test.event',
  version: 1,
  tenant_id: 't1',
  entity_id: 'e1',
  payload: {},
  idempotency_key: null,
  status: 'processing',
  created_at: new Date().toISOString(),
  next_attempt_at: new Date().toISOString(),
  attempts: 0,
}

beforeEach(() => {
  state.calls = []
  state.updateResult = { data: [ROW], error: null }
})

describe('claimOutboxEvent (B-05b)', () => {
  it('claims a pending row and maps it', async () => {
    const event = await claimOutboxEvent('evt1')
    expect(event).not.toBeNull()
    expect(event!.id).toBe('evt1')
    expect(event!.tenantId).toBe('t1')
    const eqCalls = state.calls.filter(([op]) => op === 'eq')
    expect(eqCalls).toContainEqual(['eq', 'id', 'evt1'])
    expect(eqCalls).toContainEqual(['eq', 'status', 'pending'])
  })

  it('stamps claim ownership (claimed_at + worker_id)', async () => {
    await claimOutboxEvent('evt1')
    const updateCalls = state.calls.filter(([op]) => op === 'update')
    expect(updateCalls).toHaveLength(1)
    const payload = updateCalls[0][1] as Record<string, unknown>
    expect(payload.status).toBe('processing')
    expect(typeof payload.claimed_at).toBe('string')
    expect(typeof payload.worker_id).toBe('string')
  })

  it('returns null silently when the race is lost (0 rows)', async () => {
    state.updateResult = { data: [], error: null }
    const event = await claimOutboxEvent('evt1')
    expect(event).toBeNull()
  })

  it('returns null on DB error (fail-safe: caller skips, row stays pending)', async () => {
    state.updateResult = { data: null, error: { message: 'boom' } }
    const event = await claimOutboxEvent('evt1')
    expect(event).toBeNull()
  })

  it('concurrent claimants converge to exactly one winner', async () => {
    // Serialized mock: first writer transitions the row, second sees no match.
    state.updateResult = { data: [ROW], error: null }
    const first = claimOutboxEvent('evt1')
    state.updateResult = { data: [], error: null }
    const second = claimOutboxEvent('evt1')
    const [r1, r2] = await Promise.all([first, second])
    const winners = [r1, r2].filter(Boolean)
    expect(winners).toHaveLength(1)
    expect(winners[0]!.id).toBe('evt1')
  })
})
