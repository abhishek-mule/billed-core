import { describe, it, expect, vi, beforeEach } from 'vitest'

// Flexible supabase chain mock that records calls and returns per-table data.
// Every method returns an api object exposing `.data`/`.error`/`.single()`.
function makeMockSupabase(handlers: Record<string, { data: any; error: any }>) {
  const fromCalls: string[] = []
  const supabaseAdmin = {
    from: vi.fn((table: string) => {
      fromCalls.push(table)
      const result = handlers[table] ?? { data: null, error: null }
      const api: any = {
        data: result.data,
        error: result.error,
        single: () => ({ data: result.data, error: result.error }),
        maybeSingle: () => ({ data: result.data, error: result.error }),
      }
      const chainMethods = ['select', 'insert', 'update', 'eq', 'in', 'order', 'limit', 'gte', 'lt', 'neq']
      for (const m of chainMethods) {
        api[m] = vi.fn(() => api)
      }
      return api
    }),
  }
  return { supabaseAdmin, fromCalls }
}

async function loadWithMock(handlers: Record<string, { data: any; error: any }>) {
  vi.doMock('../supabase-admin', () => ({
    supabaseAdmin: makeMockSupabase(handlers).supabaseAdmin,
  }))
  return import('../feature-flags')
}

describe('feature-flags', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('canUse returns true for a feature included in the plan', async () => {
    const { canUse } = await loadWithMock({
      tenants: { data: { plan: 'pro', plan_version: 1, subscription_state: 'active', subscription_status: 'active' }, error: null },
      feature_flags: { data: [], error: null },
    })
    expect(await canUse('t1', 'auto_recovery')).toBe(true)
  })

  it('canUse returns false for a feature not in the plan', async () => {
    const { canUse } = await loadWithMock({
      tenants: { data: { plan: 'starter', plan_version: 1, subscription_state: 'trialing', subscription_status: 'free' }, error: null },
      feature_flags: { data: [], error: null },
    })
    expect(await canUse('t1', 'auto_recovery')).toBe(false)
  })

  it('feature flag override grants a feature not in the base plan', async () => {
    const { canUse } = await loadWithMock({
      tenants: { data: { plan: 'starter', plan_version: 1, subscription_state: 'trialing', subscription_status: 'free' }, error: null },
      feature_flags: { data: [{ flag: 'auto_recovery', enabled: true, expires_at: null }], error: null },
    })
    expect(await canUse('t1', 'auto_recovery')).toBe(true)
  })

  it('checkQuota allows when under limit', async () => {
    const { checkQuota } = await loadWithMock({
      tenant_usage: { data: { reminders_sent: 1 }, error: null },
    })
    const res = await checkQuota('t1', 'reminders_sent', 3)
    expect(res.allowed).toBe(true)
    expect(res.remaining).toBe(2)
  })

  it('checkQuota blocks when at limit', async () => {
    const { checkQuota } = await loadWithMock({
      tenant_usage: { data: { reminders_sent: 3 }, error: null },
    })
    const res = await checkQuota('t1', 'reminders_sent', 3)
    expect(res.allowed).toBe(false)
    expect(res.remaining).toBe(0)
  })

  it('checkQuota is unlimited for -1 limit', async () => {
    const { checkQuota } = await loadWithMock({
      tenant_usage: { data: null, error: null },
    })
    const res = await checkQuota('t1', 'reminders_sent', -1)
    expect(res.allowed).toBe(true)
    expect(res.unlimited).toBe(true)
  })

  it('can() maps capability to underlying feature', async () => {
    const { can } = await loadWithMock({
      tenants: { data: { plan: 'pro', plan_version: 1, subscription_state: 'active', subscription_status: 'active' }, error: null },
      feature_flags: { data: [], error: null },
    })
    expect(await can('t1', 'AUTO_RECOVERY')).toBe(true)
    expect(await can('t1', 'EXPORTS')).toBe(false)
    expect(await can('t1', 'API')).toBe(false)
  })

  it('getCapabilities exposes capability booleans without plan names', async () => {
    const { getCapabilities } = await loadWithMock({
      tenants: { data: { plan: 'business', plan_version: 1, subscription_state: 'active', subscription_status: 'active' }, error: null },
      feature_flags: { data: [], error: null },
    })
    const caps = await getCapabilities('t1')
    expect(caps.AUTO_RECOVERY).toBe(true)
    expect(caps.ANALYTICS).toBe(true)
    expect(caps.API).toBe(true)
    expect(caps.MULTI_BRANCH).toBe(true)
  })
})
