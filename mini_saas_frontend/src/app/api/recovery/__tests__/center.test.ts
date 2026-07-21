import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/billzo/api-middleware', () => ({
  verifyRequest: vi.fn(async () => ({ tenantId: 't1' })),
}))
vi.mock('@/lib/billzo/supabase-admin', () => ({
  supabaseAdmin: { from: vi.fn() },
}))

import { GET } from '@/app/api/recovery/center/route'

const { supabaseAdmin } = await import('@/lib/billzo/supabase-admin')

// table → array of result rows the route should receive
let tableData: Record<string, any[]> = {}
let caseCall = 0 // recovery_cases is queried twice (active, then recovered)

function fromMock(table: string) {
  let result: any = null
  if (table === 'recovery_cases') {
    // 1st call = Needs Action (active states); 2nd = Recently Recovered
    result = caseCall === 0 ? (tableData['recovery_cases_active'] || []) : (tableData['recovery_cases_recovered'] || [])
    caseCall++
  } else {
    result = tableData[table] || []
  }
  // The chain must be BOTH chainable (returns itself for .select/.eq/...) AND
  // awaitable (resolves to { data, error }), mirroring Supabase's builder.
  const chain: any = {
    then(resolve: any, reject?: any) {
      return Promise.resolve({ data: result, error: null }).then(resolve, reject)
    },
    catch(reject: any) {
      return Promise.resolve({ data: result, error: null }).catch(reject)
    },
  }
  const passthrough = () => chain
  for (const m of ['select', 'eq', 'in', 'gt', 'gte', 'lt', 'order', 'limit']) chain[m] = passthrough
  chain.maybeSingle = () => Promise.resolve({ data: Array.isArray(result) ? (result[0] ?? null) : result, error: null })
  return chain
}

function makeReq() {
  return { method: 'GET', url: 'http://localhost/api/recovery/center' } as any
}

describe('recovery center route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    caseCall = 0
    tableData = {}
    ;(supabaseAdmin.from as any).mockImplementation(fromMock)
  })

  it('requires authentication', async () => {
    const { verifyRequest } = await import('@/lib/billzo/api-middleware')
    ;(verifyRequest as any).mockReturnValueOnce({ response: new Response('no', { status: 401 }) })
    const res = await GET(makeReq())
    expect(res.status).toBe(401)
  })

  it('returns 401 when no tenant', async () => {
    const { verifyRequest } = await import('@/lib/billzo/api-middleware')
    ;(verifyRequest as any).mockReturnValueOnce({ response: null, tenantId: null })
    const res = await GET(makeReq())
    expect(res.status).toBe(401)
  })

  it('aggregates needs action, scheduled, recovered, timeline', async () => {
    tableData = {
      recovery_cases_active: [
        { id: 'rc1', customer_id: 'cu1', total_outstanding: '12400', total_overdue: '18', recovery_state_v2: 'overdue', promise_to_pay_date: null, next_action_type: 'call' },
      ],
      recovery_cases_recovered: [
        { id: 'rc2', customer_id: 'cu2', total_outstanding: '0', recovery_state_v2: 'recovered', updated_at: new Date().toISOString() },
      ],
      customers: [
        { id: 'cu1', customer_name: 'ABC Traders', phone: '999', customer_tier: 'standard' },
        { id: 'cu2', customer_name: 'Aniket', phone: '888', customer_tier: 'standard' },
      ],
      invoices: [
        { customer_id: 'cu1', total: '12400', paid_amount: '0', status: 'unpaid', due_date: '2025-07-01' },
      ],
      collection_actions: [
        { id: 'ca1', customer_id: 'cu1', action_type: 'reminder', channel: 'whatsapp', template_name: 'Reminder', scheduled_at: new Date().toISOString(), invoice_ids: ['inv1'] },
      ],
      collection_action_events: [
        { action_id: 'ca1', event_type: 'delivered', to_status: null, created_at: new Date().toISOString(), payload: { channel: 'whatsapp' } },
      ],
    }

    const res = await GET(makeReq())
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.needsAction).toHaveLength(1)
    expect(json.needsAction[0].customerName).toBe('ABC Traders')
    expect(json.needsAction[0].outstanding).toBe(12400)
    expect(json.needsAction[0].recommendedAction).toBe('call')
    expect(json.scheduledToday).toHaveLength(1)
    expect(json.scheduledToday[0].customerName).toBe('ABC Traders')
    expect(json.counts.reminders).toBe(1)
    expect(json.counts.calls).toBe(0)
    expect(json.underFollowUp).toBe(12400)
    expect(json.recentlyRecovered).toHaveLength(1)
    expect(json.recentlyRecovered[0].customerName).toBe('Aniket')
    expect(json.timeline).toHaveLength(1)
  })
})
