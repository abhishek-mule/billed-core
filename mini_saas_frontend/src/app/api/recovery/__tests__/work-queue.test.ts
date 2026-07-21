import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/billzo/api-middleware', () => ({
  verifyRequest: vi.fn(async () => ({ tenantId: 't1' })),
}))
vi.mock('@/lib/billzo/supabase-admin', () => ({
  supabaseAdmin: { from: vi.fn() },
}))

import { GET } from '@/app/api/recovery/work-queue/route'

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
  for (const m of ['select', 'eq', 'in', 'gt', 'gte', 'lt', 'order', 'limit']) chain[m] = passthrough
  return chain
}

function makeReq() {
  return { nextUrl: new URL('http://localhost/api/recovery/work-queue') } as any
}

describe('work queue route', () => {
  beforeEach(() => { vi.clearAllMocks(); tableData = {}; ;(supabaseAdmin.from as any).mockImplementation(fromMock) })

  it('requires auth', async () => {
    const { verifyRequest } = await import('@/lib/billzo/api-middleware')
    ;(verifyRequest as any).mockReturnValueOnce({ response: new Response('no', { status: 401 }) })
    const res = await GET(makeReq())
    expect(res.status).toBe(401)
  })

  it('groups by required action, not status', async () => {
    const past = new Date(Date.now() - 5 * 86400000).toISOString() // broken promise 5d ago
    tableData = {
      recovery_cases: [{
        id: 'rc1', customer_id: 'cu1', total_outstanding: '18500', total_overdue: '18',
        recovery_state_v2: 'promised', promise_to_pay_date: past, broken_promises: 1,
        last_payment_at: null, next_action_type: 'call', open_invoice_count: 1,
      }],
      customers: [{ id: 'cu1', customer_name: 'ABC Traders', phone: '999', customer_tier: 'standard' }],
      invoices: [
        { customer_id: 'cu1', total: '18500', paid_amount: '0', status: 'unpaid', due_date: '2025-07-01' },
      ],
      collection_actions: [
        { id: 'ca1', customer_id: 'cu1', action_type: 'call', channel: null, template_name: null, status: 'scheduled', trigger_type: 'MANUAL', scheduled_at: new Date().toISOString(), completed_at: null, invoice_ids: [] },
        { id: 'ca2', customer_id: 'cu1', action_type: 'reminder', channel: 'whatsapp', template_name: 'R', status: 'scheduled', trigger_type: 'OVERDUE', scheduled_at: new Date().toISOString(), completed_at: null, invoice_ids: [] },
      ],
      collection_action_events: [],
    }

    const res = await GET(makeReq())
    const json = await res.json()
    expect(res.status).toBe(200)
    // broken promise → call case → Needs Call
    expect(json.needsCall.count).toBe(1)
    expect(json.needsCall.items[0].customerName).toBe('ABC Traders')
    expect(json.needsCall.items[0].reason).toMatch(/Broken promise 5d ago/)
    // reminder scheduled & due now → Send Reminder
    expect(json.sendReminder.count).toBe(1)
    // section totals present
    expect(json.needsCall.total).toBe(18500)
  })

  it('puts completed-today actions in Completed Today', async () => {
    const today = new Date().toISOString()
    tableData = {
      recovery_cases: [{
        id: 'rc1', customer_id: 'cu1', total_outstanding: '0', total_overdue: '0',
        recovery_state_v2: 'recovered', promise_to_pay_date: null, broken_promises: 0,
        last_payment_at: today, next_action_type: 'none', open_invoice_count: 0,
      }],
      customers: [{ id: 'cu1', customer_name: 'X', phone: '1', customer_tier: null }],
      collection_actions: [
        { id: 'ca1', customer_id: 'cu1', action_type: 'reminder', channel: 'whatsapp', template_name: 'R', status: 'scheduled', trigger_type: 'OVERDUE', scheduled_at: today, completed_at: today, invoice_ids: [] },
      ],
      collection_action_events: [
        { action_id: 'ca1', event_type: 'completed', created_at: today, payload: {} },
      ],
    }
    const res = await GET(makeReq())
    const json = await res.json()
    expect(json.completedToday.count).toBe(1)
    expect(json.needsCall.count).toBe(0)
    expect(json.sendReminder.count).toBe(0)
  })
})
