import { describe, it, expect, vi, beforeEach } from 'vitest'

function makeMockSupabase(handlers: Record<string, { data: any; error: any }>) {
  const supabaseAdmin = {
    from: vi.fn((table: string) => {
      const result = handlers[table] ?? { data: null, error: null }
      const api: any = {
        data: result.data,
        error: result.error,
        single: () => ({ data: result.data, error: result.error }),
        maybeSingle: () => ({ data: Array.isArray(result.data) ? (result.data[0] ?? null) : result.data, error: result.error }),
        insert: vi.fn(() => api),
        update: vi.fn(() => api),
        delete: vi.fn(() => api),
      }
      for (const m of ['select', 'eq', 'in', 'order', 'limit', 'gte', 'lte', 'contains', 'neq']) {
        api[m] = vi.fn(() => api)
      }
      return api
    }),
  }
  return { supabaseAdmin }
}

async function loadRouteWithMock(handlers: Record<string, { data: any; error: any }>) {
  vi.doMock('@/lib/billzo/supabase-admin', () => ({ supabaseAdmin: makeMockSupabase(handlers).supabaseAdmin }))
  vi.doMock('@/lib/billzo/api-middleware', () => ({
    verifyRequest: async () => ({ tenantId: 't1' }),
  }))
  return import('../diagnostics/route')
}

function makeReq(url: string) {
  return { nextUrl: new URL(url) } as any
}

describe('recovery diagnostics route', () => {
  beforeEach(() => vi.resetModules())

  it('returns 400 when invoiceId missing', async () => {
    const { GET } = await loadRouteWithMock({})
    const res = await GET(makeReq('http://x/api/recovery/diagnostics'))
    expect(res.status).toBe(400)
  })

  it('returns 404 when invoice not found', async () => {
    const { GET } = await loadRouteWithMock({ invoices: { data: null, error: null } })
    const res = await GET(makeReq('http://x/api/recovery/diagnostics?invoiceId=invX'))
    expect(res.status).toBe(404)
  })

  it('aggregates policy, actions, lifecycle, next action', async () => {
    const { GET } = await loadRouteWithMock({
      invoices: {
        data: { id: 'inv1', status: 'unpaid', total: 100, outstanding_amount: 100, due_date: '2026-07-20', created_at: '2026-07-15', customer_id: 'c1' },
        error: null,
      },
      recovery_policies: { data: { id: 'pol1', name: 'Standard', is_default: true }, error: null },
      recovery_policy_steps: {
        data: [{ sequence: 1, trigger_type: 'DUE_DATE', offset_days: 0, action_type: 'reminder', template_name: 'invoice_due', channel: 'whatsapp', is_enabled: true }],
        error: null,
      },
      collection_actions: {
        data: [
          { id: 'ca1', action_type: 'reminder', status: 'completed', scheduled_at: '2026-07-15T10:00:00Z', channel: 'whatsapp', template_name: 'invoice_due', trigger_type: 'DUE_DATE' },
          { id: 'ca2', action_type: 'reminder', status: 'scheduled', scheduled_at: '2026-07-25T10:00:00Z', channel: 'whatsapp', template_name: 'final_reminder', trigger_type: 'DUE_DATE' },
        ],
        error: null,
      },
      collection_action_events: {
        data: [{ action_id: 'ca1', event_type: 'completed', from_status: 'in_progress', to_status: 'completed', payload: {}, created_at: '2026-07-15T10:05:00Z' }],
        error: null,
      },
    })
    const res = await GET(makeReq('http://x/api/recovery/diagnostics?invoiceId=inv1'))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.policy?.name).toBe('Standard')
    expect(json.actions).toHaveLength(2)
    expect(json.lifecycle).toHaveLength(1)
    expect(json.nextAction).toBeTruthy()
    expect(json.nextAction.action_type).toBe('reminder')
  })
})
