import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/billzo/api-middleware', () => ({
  verifyRequest: vi.fn(async () => ({ tenantId: 't1' })),
}))
vi.mock('@/lib/billzo/supabase-admin', () => ({
  supabaseAdmin: { from: vi.fn() },
}))

import { GET } from '@/app/api/recovery/customer/route'

const { supabaseAdmin } = await import('@/lib/billzo/supabase-admin')

let tableData: Record<string, any[]> = {}
const order: string[] = []
function fromMock(table: string) {
  order.push(table)
  let result = tableData[table] || []
  // recovery_cases returns array; route uses .maybeSingle() → first row
  const chain: any = {
    then(resolve: any, reject?: any) {
      return Promise.resolve({ data: result, error: null }).then(resolve, reject)
    },
  }
  const passthrough = () => chain
  for (const m of ['select', 'eq', 'in', 'gt', 'gte', 'lt', 'order', 'limit', 'maybeSingle']) {
    chain[m] = m === 'maybeSingle'
      ? () => Promise.resolve({ data: Array.isArray(result) ? (result[0] ?? null) : result, error: null })
      : passthrough
  }
  return chain
}

function makeReq(customerId: string) {
  return { nextUrl: new URL(`http://localhost/api/recovery/customer?customerId=${customerId}`) } as any
}

describe('customer workspace route', () => {
  beforeEach(() => { vi.clearAllMocks(); tableData = {}; order.length = 0; ;(supabaseAdmin.from as any).mockImplementation(fromMock) })

  it('requires customerId', async () => {
    const res = await GET({ nextUrl: new URL('http://localhost/api/recovery/customer') } as any)
    expect(res.status).toBe(400)
  })

  it('aggregates case, invoices, actions, communication, recommended', async () => {
    tableData = {
      customers: [{ id: 'cu1', customer_name: 'ABC Traders', phone: '999', email: null, customer_tier: 'standard', gstin: null }],
      recovery_cases: [{
        id: 'rc1', total_outstanding: '18500', total_overdue: '18', recovery_state_v2: 'overdue',
        promise_to_pay_date: null, broken_promises: 0, last_payment_at: null, next_action_type: 'call', updated_at: new Date().toISOString(),
      }],
      invoices: [{ id: 'inv1', invoice_number: '201', grand_total: '18500', paid_amount: '0', status: 'unpaid', due_date: '2025-07-01', created_at: new Date().toISOString() }],
      collection_actions: [{
        id: 'ca1', action_type: 'reminder', channel: 'whatsapp', template_name: 'Reminder', status: 'completed',
        trigger_type: 'OVERDUE', scheduled_at: new Date().toISOString(), completed_at: new Date().toISOString(), invoice_ids: ['inv1'],
      }],
      collection_action_events: [{ action_id: 'ca1', event_type: 'read', to_status: null, created_at: new Date().toISOString(), payload: {} }],
      whatsapp_events: [{ recovery_attempt_id: 'ca1', template: 'Reminder', delivered_at: new Date().toISOString(), read_at: new Date().toISOString(), clicked_at: null, occurred_at: new Date().toISOString(), status: 'read' }],
      payment_promises: [],
    }

    const res = await GET(makeReq('cu1'))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.customer.name).toBe('ABC Traders')
    expect(json.case.outstanding).toBe(18500)
    expect(json.invoices).toHaveLength(1)
    expect(json.invoices[0].number).toBe('201')
    expect(json.actions).toHaveLength(1)
    expect(json.actions[0].delivery.readAt).toBeTruthy()
    expect(json.communication.length).toBeGreaterThan(0)
  })

  it('recommends a call when promise is broken', async () => {
    const past = new Date(Date.now() - 5 * 86400000).toISOString()
    tableData = {
      customers: [{ id: 'cu1', customer_name: 'X', phone: '1', email: null, customer_tier: null, gstin: null }],
      recovery_cases: [{ id: 'rc1', total_outstanding: '5000', total_overdue: '40', recovery_state_v2: 'promised', promise_to_pay_date: past, broken_promises: 1, last_payment_at: null, next_action_type: 'call', updated_at: new Date().toISOString() }],
      invoices: [{ id: 'inv1', invoice_number: '1', grand_total: '5000', paid_amount: '0', status: 'unpaid', due_date: '2025-06-01', created_at: new Date().toISOString() }],
      collection_actions: [], collection_action_events: [], whatsapp_events: [], payment_promises: [],
    }
    const res = await GET(makeReq('cu1'))
    const json = await res.json()
    expect(json.case.outstanding).toBe(5000)
    expect(json.case.nextAction).toBe('call')
  })
})
