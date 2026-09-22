import { describe, it, expect, vi, beforeEach } from 'vitest'
import { claimSendMarker, releaseSendMarker } from '../send-marker'

// B-05b Step 1: the UNIQUE on processed_jobs(idempotency_key) — guaranteed by
// migration 102 — is the atomic arbiter. First claimant wins, later claimants
// get 23505 and must skip the provider send.
const state = vi.hoisted(() => ({
  insertResult: { error: null as any },
  calls: [] as Array<[string, ...any[]]>,
}))

vi.mock('../supabase-admin', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      insert: (...a: any[]) => {
        state.calls.push(['insert', ...a])
        return Promise.resolve(state.insertResult)
      },
      delete: (...a: any[]) => {
        state.calls.push(['delete']);
        return { eq: (...b: any[]) => {
          state.calls.push(['eq', ...b])
          return Promise.resolve({ error: null })
        } }
      },
    })),
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  state.calls = []
  state.insertResult = { error: null }
})

describe('claimSendMarker (B-05b Step 1)', () => {
  it('claims a fresh key with tenant scoping', async () => {
    const result = await claimSendMarker({ key: 'send:executed:reminder-job:j1', tenantId: 't1' })
    expect(result).toBe('claimed')
    const insertCalls = state.calls.filter(([op]) => op === 'insert')
    expect(insertCalls).toHaveLength(1)
    const row = insertCalls[0][1] as Record<string, unknown>
    expect(row).toMatchObject({
      idempotency_key: 'send:executed:reminder-job:j1',
      job_type: 'whatsapp_send',
      tenant_id: 't1',
      status: 'claimed',
    })
  })

  it('returns duplicate (no throw) on unique violation', async () => {
    state.insertResult = { error: { code: '23505', message: 'duplicate key' } }
    const result = await claimSendMarker({ key: 'k', tenantId: 't1' })
    expect(result).toBe('duplicate')
  })

  it('throws on unexpected store errors (caller retries instead of sending unguarded)', async () => {
    state.insertResult = { error: { code: '08006', message: 'connection failure' } }
    await expect(claimSendMarker({ key: 'k', tenantId: 't1' })).rejects.toThrow(/Send-marker/)
  })

  it('releaseSendMarker deletes by key and never throws', async () => {
    await expect(releaseSendMarker('k')).resolves.toBeUndefined()
    const eqCalls = state.calls.filter(([op]) => op === 'eq')
    expect(eqCalls).toContainEqual(['eq', 'idempotency_key', 'k'])
  })
})
