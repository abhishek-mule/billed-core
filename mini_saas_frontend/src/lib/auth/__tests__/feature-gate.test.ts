import { describe, it, expect, vi, beforeEach } from 'vitest'

function makeMockSupabase(handlers: Record<string, { data: any; error: any }>) {
  const supabaseAdmin = {
    from: vi.fn((table: string) => {
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
  return { supabaseAdmin }
}

async function loadGate(handlers: Record<string, { data: any; error: any }>) {
  const { supabaseAdmin } = makeMockSupabase(handlers)
  vi.doMock('@/lib/billzo/supabase-admin', () => ({ supabaseAdmin }))
  return import('@/lib/auth/feature-gate')
}

const starterTenant = {
  plan: 'starter',
  plan_version: 1,
  subscription_state: 'active',
  subscription_status: 'active',
}

describe('requireFeature — every denial returns a unique code + message', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('TENANT_NOT_FOUND when no entitlement row exists', async () => {
    const { requireFeature } = await loadGate({})
    const gate = await requireFeature('missing_tenant', 'manual_reminders', 'POST')

    expect(gate.allowed).toBe(false)
    expect(gate.code).toBe('TENANT_NOT_FOUND')
    expect(gate.message).toMatch(/sign in again/)
  })

  it('FEATURE_LOCKED with upgradeTo when plan lacks the feature', async () => {
    const { requireFeature } = await loadGate({
      tenants: { data: starterTenant, error: null },
      feature_flags: { data: [], error: null },
    })
    const gate = await requireFeature('tenant_1', 'auto_recovery', 'POST')

    expect(gate.allowed).toBe(false)
    expect(gate.code).toBe('FEATURE_LOCKED')
    expect(gate.upgradeTo).toBe('pro')
    expect(gate.message).toMatch(/not available/)
  })

  it('TRIAL_EXPIRED after the 14-day window', async () => {
    const { requireFeature } = await loadGate({
      tenants: {
        data: {
          ...starterTenant,
          created_at: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
        },
        error: null,
      },
      feature_flags: { data: [], error: null },
    })
    const gate = await requireFeature('tenant_1', 'free_recovery_trial', 'POST')

    expect(gate.allowed).toBe(false)
    expect(gate.code).toBe('TRIAL_EXPIRED')
    expect(gate.message).toMatch(/trial has expired/)
  })

  it('TRIAL_ALREADY_USED when trial status is completed', async () => {
    const { requireFeature } = await loadGate({
      tenants: { data: { ...starterTenant, created_at: new Date().toISOString() }, error: null },
      feature_flags: { data: [], error: null },
      feature_trials: { data: { status: 'completed', started_at: new Date().toISOString() }, error: null },
    })
    const gate = await requireFeature('tenant_1', 'free_recovery_trial', 'POST')

    expect(gate.allowed).toBe(false)
    expect(gate.code).toBe('TRIAL_ALREADY_USED')
  })

  it('TRIAL_IN_PROGRESS when a trial started less than an hour ago', async () => {
    const { requireFeature } = await loadGate({
      tenants: { data: { ...starterTenant, created_at: new Date().toISOString() }, error: null },
      feature_flags: { data: [], error: null },
      feature_trials: {
        data: { status: 'running', started_at: new Date(Date.now() - 5 * 60 * 1000).toISOString() },
        error: null,
      },
    })
    const gate = await requireFeature('tenant_1', 'free_recovery_trial', 'POST')

    expect(gate.allowed).toBe(false)
    expect(gate.code).toBe('TRIAL_IN_PROGRESS')
  })
})
