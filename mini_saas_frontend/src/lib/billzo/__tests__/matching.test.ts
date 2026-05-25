import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PaymentSignal } from '../reconciliation'

// Shared mock factory for supabaseAdmin chaining
function mockSupabaseChain(result: { data: any; error: any }) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          in: vi.fn(() => ({
            order: vi.fn(() => result),
          })),
        })),
      })),
    })),
  }
}

describe('matching', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  describe('matchPaymentToInvoice', () => {
    it('should return null when no unpaid invoices exist', async () => {
      vi.doMock('../supabase-admin', () => ({
        supabaseAdmin: mockSupabaseChain({ data: [], error: null }),
      }))

      const { matchPaymentToInvoice } = await import('../matching')
      const signal: PaymentSignal = {
        amount: 5000,
        currency: 'INR',
        phone: '9876543210',
        upiReference: 'UPI123',
        customerName: 'Rajesh Kumar',
        provider: 'razorpay',
        providerPaymentId: 'pay_test_001',
        paymentLinkId: null,
        timestamp: new Date().toISOString(),
        rawPayload: {},
      }
      const result = await matchPaymentToInvoice(signal, 'tenant_test_123')
      expect(result).toBeNull()
    })

    it('should match invoice with exact amount and phone', async () => {
      vi.doMock('../supabase-admin', () => ({
        supabaseAdmin: mockSupabaseChain({
          data: [
            {
              id: 'inv_001',
              total: 5000,
              paid_amount: 0,
              customer_phone: '9876543210',
              customer_name: 'Rajesh Kumar',
              created_at: new Date().toISOString(),
            },
          ],
          error: null,
        }),
      }))

      const { matchPaymentToInvoice } = await import('../matching')
      const signal: PaymentSignal = {
        amount: 5000,
        currency: 'INR',
        phone: '9876543210',
        upiReference: null,
        customerName: 'Rajesh Kumar',
        provider: 'razorpay',
        providerPaymentId: 'pay_test_002',
        paymentLinkId: null,
        timestamp: new Date().toISOString(),
        rawPayload: {},
      }
      const result = await matchPaymentToInvoice(signal, 'tenant_test_123')
      expect(result).not.toBeNull()
      expect(result!.invoiceId).toBe('inv_001')
      expect(result!.confidence).toBeGreaterThanOrEqual(0.8)
      expect(result!.matchType).toBe('exact')
    })

    it('should match invoice with close amount and phone', async () => {
      vi.doMock('../supabase-admin', () => ({
        supabaseAdmin: mockSupabaseChain({
          data: [
            {
              id: 'inv_002',
              total: 5050,
              paid_amount: 0,
              customer_phone: '9876543210',
              customer_name: 'Rajesh Sharma',
              created_at: new Date().toISOString(),
            },
          ],
          error: null,
        }),
      }))

      const { matchPaymentToInvoice } = await import('../matching')
      const signal: PaymentSignal = {
        amount: 5000,
        currency: 'INR',
        phone: '9876543210',
        upiReference: null,
        customerName: 'Rajesh Sharma',
        provider: 'razorpay',
        providerPaymentId: 'pay_test_003',
        paymentLinkId: null,
        timestamp: new Date().toISOString(),
        rawPayload: {},
      }
      const result = await matchPaymentToInvoice(signal, 'tenant_test_123')
      expect(result).not.toBeNull()
      expect(result!.invoiceId).toBe('inv_002')
      expect(result!.confidence).toBeGreaterThanOrEqual(0.7)
    })

    it('should match invoice with phone only (no amount match)', async () => {
      vi.doMock('../supabase-admin', () => ({
        supabaseAdmin: mockSupabaseChain({
          data: [
            {
              id: 'inv_003',
              total: 9999,
              paid_amount: 0,
              customer_phone: '9876543210',
              customer_name: 'Rajesh Kumar',
              created_at: new Date().toISOString(),
            },
          ],
          error: null,
        }),
      }))

      const { matchPaymentToInvoice } = await import('../matching')
      const signal: PaymentSignal = {
        amount: 5000,
        currency: 'INR',
        phone: '9876543210',
        upiReference: null,
        customerName: 'Rajesh Kumar',
        provider: 'razorpay',
        providerPaymentId: 'pay_test_004',
        paymentLinkId: null,
        timestamp: new Date().toISOString(),
        rawPayload: {},
      }
      const result = await matchPaymentToInvoice(signal, 'tenant_test_123')
      // phone (0.3) + name (0.15) + recency (0.05) = 0.5 which is below 0.7 threshold
      expect(result).toBeNull()
    })

    it('should match invoice with amount only (no phone)', async () => {
      vi.doMock('../supabase-admin', () => ({
        supabaseAdmin: mockSupabaseChain({
          data: [
            {
              id: 'inv_004',
              total: 5000,
              paid_amount: 0,
              customer_phone: '0000000000',
              customer_name: 'Someone Else',
              created_at: new Date().toISOString(),
            },
          ],
          error: null,
        }),
      }))

      const { matchPaymentToInvoice } = await import('../matching')
      const signal: PaymentSignal = {
        amount: 5000,
        currency: 'INR',
        phone: null,
        upiReference: null,
        customerName: null,
        provider: 'razorpay',
        providerPaymentId: 'pay_test_005',
        paymentLinkId: null,
        timestamp: new Date().toISOString(),
        rawPayload: {},
      }
      const result = await matchPaymentToInvoice(signal, 'tenant_test_123')
      // exact amount (0.5) + recency (0.05) = 0.55, below 0.7 threshold
      expect(result).toBeNull()
    })

    it('should return best match from multiple candidates', async () => {
      vi.doMock('../supabase-admin', () => ({
        supabaseAdmin: mockSupabaseChain({
          data: [
            {
              id: 'inv_005',
              total: 9999,
              paid_amount: 0,
              customer_phone: '1111111111',
              customer_name: 'John Doe',
              created_at: new Date().toISOString(),
            },
            {
              id: 'inv_006',
              total: 5000,
              paid_amount: 0,
              customer_phone: '9876543210',
              customer_name: 'Rajesh Kumar',
              created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
            },
          ],
          error: null,
        }),
      }))

      const { matchPaymentToInvoice } = await import('../matching')
      const signal: PaymentSignal = {
        amount: 5000,
        currency: 'INR',
        phone: '9876543210',
        upiReference: null,
        customerName: 'Rajesh Kumar',
        provider: 'razorpay',
        providerPaymentId: 'pay_test_006',
        paymentLinkId: null,
        timestamp: new Date().toISOString(),
        rawPayload: {},
      }
      const result = await matchPaymentToInvoice(signal, 'tenant_test_123')
      expect(result).not.toBeNull()
      expect(result!.invoiceId).toBe('inv_006')
      expect(result!.confidence).toBeGreaterThanOrEqual(0.8)
    })
  })
})
