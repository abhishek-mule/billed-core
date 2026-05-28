import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetTenantId = vi.fn()
vi.mock('@/lib/billzo/tenant', () => ({
  getTenantId: mockGetTenantId,
}))

// Mock supabase-js to prevent jsdom issues
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: () => ({
      upsert: vi.fn().mockResolvedValue({ error: null, status: 200 }),
    }),
  })),
}))

const mockWhere = vi.fn()
const mockAnyOf = vi.fn()
const mockFilter = vi.fn()
const mockSortBy = vi.fn()

mockWhere.mockReturnValue({ anyOf: mockAnyOf })
mockAnyOf.mockReturnValue({ filter: mockFilter })
mockFilter.mockReturnValue({ sortBy: mockSortBy })
mockSortBy.mockResolvedValue([])

const mockDbInstance = {
  queue: {
    where: mockWhere,
    get: vi.fn(),
    update: vi.fn(),
  },
}

vi.mock('@/lib/billzo/db', () => ({
  db: () => mockDbInstance,
  notifyChanged: vi.fn(),
}))

describe('syncPendingQueue tenant isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-key'
    ;(window as any).__billzoSyncing = false
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })

    mockWhere.mockReturnValue({ anyOf: mockAnyOf })
    mockAnyOf.mockReturnValue({ filter: mockFilter })
    mockFilter.mockReturnValue({ sortBy: mockSortBy })
    mockSortBy.mockResolvedValue([])
  })

  it('returns early when no tenantId is found', async () => {
    mockGetTenantId.mockReturnValue(null)

    const { syncPendingQueue } = await import('@/lib/billzo/sync')
    await syncPendingQueue()

    expect(mockWhere).not.toHaveBeenCalled()
  })

  it('queries using compound [tenantId+status] index scoped to active tenant', async () => {
    mockGetTenantId.mockReturnValue('tenant_abc')

    const { syncPendingQueue } = await import('@/lib/billzo/sync')
    await syncPendingQueue()

    expect(mockWhere).toHaveBeenCalledWith('[tenantId+status]')
    expect(mockAnyOf).toHaveBeenCalledWith(
      ['tenant_abc', 'pending'],
      ['tenant_abc', 'failed'],
      ['tenant_abc', 'conflict'],
    )
  })

  it('does not fetch items belonging to other tenants', async () => {
    mockGetTenantId.mockReturnValue('tenant_xyz')

    const { syncPendingQueue } = await import('@/lib/billzo/sync')
    await syncPendingQueue()

    const calls = mockAnyOf.mock.calls[0]
    expect(calls).toHaveLength(3)
    for (const [tenantId] of calls) {
      expect(tenantId).toBe('tenant_xyz')
    }
  })
})
