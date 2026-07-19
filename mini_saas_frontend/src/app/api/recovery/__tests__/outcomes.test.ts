import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/billzo/api-middleware', () => ({
  verifyRequest: vi.fn(async () => ({ tenantId: 't1' })),
}))
vi.mock('@/lib/billzo/supabase-admin', () => ({
  supabaseAdmin: { from: vi.fn() },
}))

import { GET } from '@/app/api/recovery/outcomes/route'

const { supabaseAdmin } = await import('@/lib/billzo/supabase-admin')

let tableData: Record<string, any[]> = {}
function fromMock(table: string) {
  let result = tableData[table] || []
  const chain: any = {
    then(resolve: any, reject?: any) {
      return Promise.resolve({ data: result, error: null }).then(resolve, reject)
    },
  }
  const passthrough = () => chain
  for (const m of ['select', 'eq', 'in', 'gte', 'limit']) chain[m] = passthrough
  return chain
}

function makeReq(windowDays?: number) {
  return { nextUrl: new URL('http://localhost/api/recovery/outcomes' + (windowDays ? `?windowDays=${windowDays}` : '')) } as any
}

describe('outcome analytics route', () => {
  beforeEach(() => { vi.clearAllMocks(); tableData = {}; ;(supabaseAdmin.from as any).mockImplementation(fromMock) })

  it('requires auth', async () => {
    const { verifyRequest } = await import('@/lib/billzo/api-middleware')
    ;(verifyRequest as any).mockReturnValueOnce({ response: new Response('no', { status: 401 }) })
    const res = await GET(makeReq())
    expect(res.status).toBe(401)
  })

  it('computes action + promise + communication analytics from events', async () => {
    tableData = {
      collection_actions: [
        { id: 'a1', action_type: 'reminder', status: 'completed', scheduled_at: new Date(Date.now() - 2 * 86400000).toISOString(), completed_at: new Date(Date.now() - 2 * 86400000).toISOString(), invoice_ids: ['i1'] },
        { id: 'a2', action_type: 'call', status: 'completed', scheduled_at: new Date(Date.now() - 1 * 86400000).toISOString(), completed_at: new Date(Date.now() - 1 * 86400000).toISOString(), invoice_ids: [] },
      ],
      collection_action_events: [
        { action_id: 'a1', event_type: 'delivered', to_status: null, created_at: new Date().toISOString(), payload: {} },
        { action_id: 'a1', event_type: 'read', to_status: null, created_at: new Date().toISOString(), payload: {} },
        { action_id: 'a1', event_type: 'payment_received', to_status: null, created_at: new Date().toISOString(), payload: { amount: 1000 } },
        { action_id: 'a2', event_type: 'payment_received', to_status: null, created_at: new Date().toISOString(), payload: {} },
      ],
      payment_promises: [
        { status: 'kept', promise_date: new Date(Date.now() - 5 * 86400000).toISOString(), created_at: new Date().toISOString(), paid_at: new Date(Date.now() - 3 * 86400000).toISOString() },
        { status: 'broken', promise_date: new Date(Date.now() - 5 * 86400000).toISOString(), created_at: new Date().toISOString(), paid_at: new Date().toISOString() },
      ],
    }
    const res = await GET(makeReq(30))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.analytics.reminders.sent).toBe(1)
    expect(json.analytics.reminders.paid).toBe(1)
    expect(json.analytics.reminders.recoveryRate).toBe(100)
    expect(json.analytics.phoneCalls.sent).toBe(1)
    expect(json.analytics.phoneCalls.paid).toBe(1)
    expect(json.analytics.phoneCalls.recoveryRate).toBe(100)
    expect(json.analytics.promises.total).toBe(2)
    expect(json.analytics.promises.keptRate).toBe(50)
    expect(json.analytics.whatsapp.readRate).toBe(100)
  })
})
