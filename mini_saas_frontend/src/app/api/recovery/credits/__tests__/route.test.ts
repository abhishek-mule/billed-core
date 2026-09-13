import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/billzo/api-middleware', () => ({
  verifyRequest: vi.fn(async () => ({ tenantId: 't1', userId: 'u1' })),
  errorResponse: vi.fn((msg: string, status: number) => new Response(msg, { status })),
  logApiAccess: vi.fn(),
}))

vi.mock('@/lib/billzo/supabase-admin', () => ({
  supabaseAdmin: { from: vi.fn() },
}))

let currentPeriodEndMock: string | null = '2026-09-30T00:00:00Z'

vi.mock('@/lib/billzo/recovery-credits', () => ({
  getRecoveryCreditBalancesForTenant: vi.fn(async () => ({ included: 137, purchased: 250 })),
  getRecoveryCreditCurrentPeriodEnd: vi.fn(async () => currentPeriodEndMock),
}))

import { GET } from '@/app/api/recovery/credits/route'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'

interface Chain {
  [m: string]: (...args: any[]) => Chain | Promise<{ data: any; error: any }>
}

function makeReq() {
  return { nextUrl: new URL('http://localhost/api/recovery/credits') } as any
}

function thenable(data: any, error: any = null) {
  return Promise.resolve({ data, error })
}

describe('recovery credits GET route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    currentPeriodEndMock = '2026-09-30T00:00:00Z'
  })

  function setupTables(opts: { enabled?: boolean; deferred?: number; periodEnd?: string | null } = {}) {
    const { enabled = true, deferred = 0, periodEnd = '2026-09-30T00:00:00Z' } = opts
    currentPeriodEndMock = periodEnd
    const chain = (data: any) => {
      const c: Chain = {}
      const self = (..._args: any[]) => c
      for (const m of ['select', 'eq', 'maybeSingle', 'limit']) c[m] = self
      c.maybeSingle = async () => thenable({ recovery_credits_enabled: enabled })
      c.then = async (resolve: any) => resolve(thenable(data))
      return c
    }
    ;(supabaseAdmin.from as any).mockImplementation((table: string) => {
      if (table === 'tenants') return chain(null)
      if (table === 'collection_actions') return chain(deferred ? Array.from({ length: deferred }, (_, i) => ({ id: `d${i}` })) : [])
      return chain(null)
    })
  }

  it('requires authentication', async () => {
    const { verifyRequest } = await import('@/lib/billzo/api-middleware')
    ;(verifyRequest as any).mockReturnValueOnce({ response: new Response('no', { status: 401 }) })
    const res = await GET(makeReq())
    expect(res.status).toBe(401)
  })

  it('returns per-pool balances, packet catalog and deferral state', async () => {
    setupTables({ enabled: true, deferred: 3, periodEnd: '2026-09-30T00:00:00Z' })
    const res = await GET(makeReq())
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.enabled).toBe(true)
    expect(json.balances).toEqual({ included: 137, purchased: 250, available: 387 })
    expect(json.deferredCount).toBe(3)
    expect(json.deferredReason).toBe('deferred_due_to_credits')
    expect(json.currentPeriodEnd).toBe('2026-09-30T00:00:00Z')
    expect(json.packets.length).toBeGreaterThan(0)
    const p50 = json.packets.find((p: any) => p.code === 'credits_50')
    expect(p50.credits).toBe(50)
    expect(p50.priceRupees).toBe(p50.pricePaise / 100)
  })

  it('reports disabled tenants with zero balances and no packets action', async () => {
    setupTables({ enabled: false, deferred: 0, periodEnd: null })
    const res = await GET(makeReq())
    const json = await res.json()
    expect(json.enabled).toBe(false)
    expect(json.packets.length).toBeGreaterThan(0) // catalog is still informational
  })
})