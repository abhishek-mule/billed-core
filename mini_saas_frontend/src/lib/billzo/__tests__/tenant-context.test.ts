import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../supabase-admin', () => ({
  supabaseAdmin: { from: vi.fn() },
}))

vi.mock('../auth-store', () => ({
  findSessionsByUserId: vi.fn(),
}))

vi.mock('../feature-flags', () => ({
  getEntitlement: vi.fn(),
}))

import { resolveTenantForUser, buildTenantContext } from '../tenant-context'
import { supabaseAdmin } from '../supabase-admin'
import { findSessionsByUserId } from '../auth-store'
import { getEntitlement } from '../feature-flags'

function mockChain(terminal: Record<string, any> = {}) {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    ...terminal,
  }
  return chain
}

describe('resolveTenantForUser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns membership when tenant_memberships has an active row', async () => {
    ;(supabaseAdmin.from as any).mockReturnValue(
      mockChain({
        maybeSingle: vi.fn().mockResolvedValue({
          data: { tenant_id: 'tenant_abc', role: 'owner', tenants: { name: 'Abb Traders' } },
          error: null,
        }),
      }),
    )

    const result = await resolveTenantForUser('user_1')
    expect(result).toEqual({
      tenantId: 'tenant_abc',
      merchantName: 'Abb Traders',
      membershipRole: 'owner',
    })
    expect(supabaseAdmin.from).toHaveBeenCalledWith('tenant_memberships')
  })

  it('falls back to Redis sessions when no membership exists', async () => {
    ;(supabaseAdmin.from as any).mockReturnValue(mockChain())
    ;(findSessionsByUserId as any).mockResolvedValue([
      { tenantId: 'tenant_from_session' },
    ])

    const result = await resolveTenantForUser('user_2')
    expect(result.tenantId).toBe('tenant_from_session')
  })

  it('returns empty object when nothing resolves', async () => {
    ;(supabaseAdmin.from as any).mockReturnValue(mockChain())
    ;(findSessionsByUserId as any).mockResolvedValue([])

    const result = await resolveTenantForUser('user_3')
    expect(result).toEqual({})
  })
})

describe('buildTenantContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(getEntitlement as any).mockResolvedValue({
      tenantId: 'tenant_abc',
      planCode: 'starter',
      planVersion: 1,
      subscriptionState: 'trialing',
      isPaid: false,
      features: ['manual_reminders'],
    })
  })

  it('merges membership + entitlement into a TenantContext', async () => {
    const ctx = await buildTenantContext('user_1', 'tenant_abc', {
      tenantId: 'tenant_abc',
      merchantName: 'Abb Traders',
      membershipRole: 'owner',
    })

    expect(ctx).toMatchObject({
      tenantId: 'tenant_abc',
      userId: 'user_1',
      merchantId: 'tenant_abc',
      membershipRole: 'owner',
      plan: 'starter',
      subscriptionState: 'trialing',
      features: ['manual_reminders'],
    })
    expect(ctx.permissions).toContain('tenant.manage')
    expect(ctx.permissions).toContain('reminders.send')
  })

  it('owner without entitlement still yields a safe starter context', async () => {
    ;(getEntitlement as any).mockResolvedValue(null)
    const ctx = await buildTenantContext('user_1', 'tenant_missing', {
      tenantId: 'tenant_missing',
      membershipRole: 'owner',
    })

    expect(ctx.plan).toBe('starter')
    expect(ctx.isPaid).toBe(false)
    expect(ctx.permissions).toContain('tenant.manage')
  })
})
