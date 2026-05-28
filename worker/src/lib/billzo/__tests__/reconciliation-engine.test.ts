import { describe, it, expect, vi, beforeEach } from 'vitest'
import { reconcilePayment } from '../reconciliation'
import { matchPaymentToInvoice } from '../matching'
import { supabaseAdmin } from '../supabase-admin'

vi.mock('../supabase-admin', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}))

vi.mock('../events', () => ({
  emitPaymentReconciled: vi.fn().mockResolvedValue('evt_1'),
  emitPaymentCompleted: vi.fn().mockResolvedValue('evt_2'),
}))

function stub(result: any) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    order: vi.fn().mockResolvedValue(result),
    single: vi.fn().mockResolvedValue(result),
    update: vi.fn(() => ({
      eq: vi.fn().mockResolvedValue({ error: null }),
    })),
    insert: vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue(result),
      })),
    })),
  }
  return chain
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('reconcilePayment — payment_link match', () => {
  it('matches by payment_link_id', async () => {
    const mockInvoice = { id: 'inv_123', total: 1000, status: 'unpaid', customer_name: 'Test', customer_phone: '9876543210', created_at: new Date().toISOString() }
    ;(supabaseAdmin.from as any).mockReturnValue(stub({ data: mockInvoice, error: null }))

    const result = await reconcilePayment(
      { amount: 1000, currency: 'INR', phone: '9876543210', upiReference: null, customerName: 'Test', provider: 'razorpay', providerPaymentId: 'pay_abc', paymentLinkId: 'link_xyz', timestamp: new Date().toISOString(), rawPayload: {} },
      'tenant_1',
    )

    expect(result.matched).toBe(true)
    expect(result.invoiceId).toBe('inv_123')
    expect(result.matchType).toBe('payment_link')
    expect(result.confidence).toBe(1.0)
  })
})

describe('reconcilePayment — fuzzy match', () => {
  it('matches by amount + phone when no payment_link_id', async () => {
    const invoices = [
      { id: 'inv_1', total: 500, status: 'unpaid', customer_name: 'Rahul', customer_phone: '9876543210', paid_amount: 0, created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString() },
    ]

    ;(supabaseAdmin.from as any).mockReturnValue(stub({ data: invoices, error: null }))

    const result = await reconcilePayment(
      { amount: 500, currency: 'INR', phone: '9876543210', upiReference: null, customerName: 'Rahul', provider: 'razorpay', providerPaymentId: 'pay_def', paymentLinkId: null, timestamp: new Date().toISOString(), rawPayload: {} },
      'tenant_1',
    )

    expect(result.matched).toBe(true)
    expect(result.invoiceId).toBe('inv_1')
  })
})

describe('matchPaymentToInvoice — scoring', () => {
  it('scores exact match with reasons', async () => {
    const invoices = [
      { id: 'inv_1', total: 500, status: 'unpaid', customer_name: 'Rahul Sharma', customer_phone: '9876543210', paid_amount: 0, created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() },
    ]

    ;(supabaseAdmin.from as any).mockReturnValue(stub({ data: invoices, error: null }))

    const result = await matchPaymentToInvoice(
      { amount: 500, currency: 'INR', phone: '9876543210', upiReference: null, customerName: 'Rahul Sharma', provider: 'razorpay', providerPaymentId: 'pay_test', paymentLinkId: null, timestamp: new Date().toISOString(), rawPayload: {} },
      'tenant_1',
    )

    expect(result).not.toBeNull()
    expect(result!.confidence).toBeGreaterThanOrEqual(0.7)
    expect(result!.reasons).toContain('exact_amount')
    expect(result!.reasons).toContain('phone_match')
    expect(result!.reasons).toContain('name_match')
  })

  it('returns null when confidence is below 0.7', async () => {
    const invoices = [
      { id: 'inv_1', total: 1000, status: 'unpaid', customer_name: 'Someone Else', customer_phone: '1111111111', paid_amount: 0, created_at: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString() },
    ]

    ;(supabaseAdmin.from as any).mockReturnValue(stub({ data: invoices, error: null }))

    const result = await matchPaymentToInvoice(
      { amount: 500, currency: 'INR', phone: '9999999999', upiReference: null, customerName: 'Different Name', provider: 'razorpay', providerPaymentId: 'pay_test2', paymentLinkId: null, timestamp: new Date().toISOString(), rawPayload: {} },
      'tenant_1',
    )

    expect(result).toBeNull()
  })
})
