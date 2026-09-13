import { describe, it, expect, vi, beforeEach } from 'vitest'
import crypto from 'crypto'

const fetchOrderMock = vi.hoisted(() => vi.fn())
const processWebhookMock = vi.hoisted(() => vi.fn())

vi.mock('razorpay', () => {
  class MockRazorpay {
    orders = { fetch: fetchOrderMock }
    constructor() {}
  }
  return { default: MockRazorpay }
})

vi.mock('@/lib/billzo/reconciliation', () => ({
  processRazorpayPaymentWebhook: processWebhookMock,
}))

vi.mock('@/lib/billzo/billing-events', () => ({
  recordBillingEvent: vi.fn(),
  publishSubscriptionChange: vi.fn(),
}))

vi.mock('@/lib/billzo/supabase-admin', () => ({
  supabaseAdmin: { from: vi.fn() },
  getDeviceTokens: vi.fn(async () => []),
}))

vi.mock('@/lib/billzo/firebase-admin', () => ({
  getFirebaseMessaging: vi.fn(() => null),
}))

import { POST } from '@/app/api/payment/webhook/route'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'

const SECRET = 'whsec_b04_test'

function invoiceFrom(rows: any[]) {
  const chain: any = {
    then(resolve: any, reject?: any) {
      return Promise.resolve({ data: rows[0] ?? null, error: null }).then(resolve, reject)
    },
  }
  for (const m of ['select', 'eq', 'in', 'order', 'limit', 'single']) chain[m] = () => chain
  return chain
}

function makeRequest(payment: any, event = 'payment.captured') {
  const body = JSON.stringify({
    event,
    payload: { payment: { entity: payment } },
  })
  const signature = crypto.createHmac('sha256', SECRET).update(body).digest('hex')
  return new Request('http://localhost/api/payment/webhook', {
    method: 'POST',
    body,
    headers: {
      'content-type': 'application/json',
      'x-razorpay-signature': signature,
    },
  }) as any
}

describe('payment webhook — B-04 hostile tenant-resolution regression', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.RAZORPAY_WEBHOOK_SECRET = SECRET
    process.env.RAZORPAY_KEY_ID = 'rzp_key'
    process.env.RAZORPAY_KEY_SECRET = 'rzp_secret'
    ;(supabaseAdmin.from as any).mockImplementation((table: string) => {
      if (table === 'invoices') return invoiceFrom([{ tenant_id: 'tenant_A' }])
      return invoiceFrom([])
    })
    processWebhookMock.mockResolvedValue({ matched: true, invoiceId: 'inv_A1', matchType: 'payment_link', confidence: 1 })
  })

  const stdOrder = (over: any = {}) => ({
    id: 'order_OK',
    notes: { source: 'billzo_standard_checkout', tenantId: 'tenant_A', invoiceId: 'inv_A1', ...over },
  })

  it('resolves the tenant from the server-created order and ignores payment.notes entirely', async () => {
    fetchOrderMock.mockResolvedValue(stdOrder())
    const payment = {
      id: 'pay_1',
      order_id: 'order_OK',
      amount: 125075,
      notes: { tenantId: 'tenant_EVIL' }, // attacker-controlled — must be ignored
    }
    const res = await POST(makeRequest(payment))
    expect(res.status).toBe(200)
    expect(fetchOrderMock).toHaveBeenCalledWith('order_OK')
    expect(processWebhookMock).toHaveBeenCalledTimes(1)
    expect(processWebhookMock.mock.calls[0][1]).toBe('tenant_A')
  })

  it('HOSTILE A: notes.tenantId claims a victim but order binds the attacker — reconcile under attacker only', async () => {
    fetchOrderMock.mockResolvedValue(stdOrder({ tenantId: 'tenant_ATTACKER', invoiceId: 'inv_ATT' }))
    ;(supabaseAdmin.from as any).mockImplementation((table: string) =>
      table === 'invoices' ? invoiceFrom([{ tenant_id: 'tenant_ATTACKER' }]) : invoiceFrom([]))
    const payment = {
      id: 'pay_2',
      order_id: 'order_ATT',
      amount: 10000,
      notes: { tenantId: 'tenant_VICTIM' },
    }
    await POST(makeRequest(payment))
    expect(processWebhookMock).toHaveBeenCalledTimes(1)
    expect(processWebhookMock.mock.calls[0][1]).toBe('tenant_ATTACKER')
    expect(processWebhookMock.mock.calls[0][1]).not.toBe('tenant_VICTIM')
  })

  it('HOSTILE B: no order_id → payment is dropped, no reconciliation at all', async () => {
    const payment = {
      id: 'pay_3',
      amount: 10000,
      notes: { tenantId: 'tenant_VICTIM' },
    }
    await POST(makeRequest(payment))
    expect(fetchOrderMock).not.toHaveBeenCalled()
    expect(processWebhookMock).not.toHaveBeenCalled()
  })

  it('HOSTILE C: order fetch failure → no reconciliation, no fallback to payment.notes', async () => {
    fetchOrderMock.mockRejectedValue(new Error('provider unavailable'))
    const payment = {
      id: 'pay_4',
      order_id: 'order_GONE',
      amount: 10000,
      notes: { tenantId: 'tenant_VICTIM' },
    }
    await POST(makeRequest(payment))
    expect(processWebhookMock).not.toHaveBeenCalled()
  })

  it('HOSTILE D: order tenant A claims an invoice owned by tenant B → NO reconciliation, NO writes', async () => {
    fetchOrderMock.mockResolvedValue(stdOrder({ tenantId: 'tenant_A', invoiceId: 'inv_B' }))
    // inv_B is owned by another tenant
    ;(supabaseAdmin.from as any).mockImplementation((table: string) =>
      table === 'invoices' ? invoiceFrom([{ tenant_id: 'tenant_B' }]) : invoiceFrom([]))
    const payment = {
      id: 'pay_5',
      order_id: 'order_OK',
      amount: 10000,
      notes: { tenantId: 'tenant_A' },
    }
    await POST(makeRequest(payment))
    expect(processWebhookMock).not.toHaveBeenCalled()
    // no payment write / no reconciliation / no recovery outcome reachable
    expect(fetchOrderMock).toHaveBeenCalledWith('order_OK')
  })

  it('HOSTILE D-2: unbound order (no invoiceId / unknown invoice) → fail closed', async () => {
    fetchOrderMock.mockResolvedValue(stdOrder({ invoiceId: 'inv_MISSING' }))
    ;(supabaseAdmin.from as any).mockImplementation((table: string) =>
      table === 'invoices' ? invoiceFrom([]) : invoiceFrom([]))
    const payment = { id: 'pay_6', order_id: 'order_OK', amount: 10000, notes: {} }
    await POST(makeRequest(payment))
    expect(processWebhookMock).not.toHaveBeenCalled()
  })

  it('excludes non-BillZo orders (e.g. subscription fallback orders with no source) from invoice reconciliation', async () => {
    fetchOrderMock.mockResolvedValue({
      id: 'order_SUB',
      notes: { tenantId: 'tenant_A', plan: 'pro', subscriptionId: 'sub_1' },
    })
    const payment = { id: 'pay_7', order_id: 'order_SUB', amount: 100000, notes: {} }
    await POST(makeRequest(payment))
    expect(processWebhookMock).not.toHaveBeenCalled()
  })
})