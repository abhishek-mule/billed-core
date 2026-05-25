import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../supabase-admin', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}))

vi.mock('../outbox', () => ({
  writeOutboxEvent: vi.fn().mockResolvedValue('evt_mock_001'),
}))

vi.mock('../idempotency', async () => {
  const actual = await vi.importActual('../idempotency')
  return {
    ...actual,
    executeIdempotent: vi.fn((_key, _type, _tenant, executor) => executor()),
    checkIdempotency: vi.fn().mockResolvedValue({ isDuplicate: false }),
    recordProcessedJob: vi.fn().mockResolvedValue(true),
  }
})

function mockChain(terminal: Record<string, any> = {}) {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    lte: vi.fn(() => chain),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    update: vi.fn(() => chain),
    insert: vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      })),
    })),
    ...terminal,
  }
  return chain
}

describe('reconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('RazorpayWebhookSource.ingest', () => {
    it('should return null when no payment object in payload', async () => {
      const { RazorpayWebhookSource } = await import('../reconciliation')
      const source = new RazorpayWebhookSource()
      const result = await source.ingest({ event: 'payment.captured' })
      expect(result).toBeNull()
    })

    it('should return null when payment has no entity', async () => {
      const { RazorpayWebhookSource } = await import('../reconciliation')
      const source = new RazorpayWebhookSource()
      const result = await source.ingest({ payment: {} })
      expect(result).toBeNull()
    })

    it('should parse valid Razorpay payment payload', async () => {
      const { RazorpayWebhookSource } = await import('../reconciliation')
      const source = new RazorpayWebhookSource()
      const result = await source.ingest({
        payment: {
          entity: {
            id: 'pay_mock_001',
            amount: 500000,
            currency: 'INR',
            contact: '9876543210',
            notes: {
              invoiceId: 'inv_test_001',
              customer_name: 'Rajesh Kumar',
            },
            acquirer_data: {
              upi_transaction_id: 'UPI123456',
            },
            payment_link_id: 'plink_test_001',
            created_at: '2026-05-25T10:00:00Z',
          },
        },
      })

      expect(result).not.toBeNull()
      expect(result!.amount).toBe(5000)
      expect(result!.currency).toBe('INR')
      expect(result!.phone).toBe('9876543210')
      expect(result!.upiReference).toBe('UPI123456')
      expect(result!.customerName).toBe('Rajesh Kumar')
      expect(result!.provider).toBe('razorpay')
      expect(result!.providerPaymentId).toBe('pay_mock_001')
      expect(result!.paymentLinkId).toBe('plink_test_001')
      expect(result!.timestamp).toBe('2026-05-25T10:00:00Z')
    })

    it('should handle missing optional fields gracefully', async () => {
      const { RazorpayWebhookSource } = await import('../reconciliation')
      const source = new RazorpayWebhookSource()
      const result = await source.ingest({
        payment: {
          entity: {
            id: 'pay_mock_002',
            amount: 100000,
            currency: 'INR',
            created_at: '2026-05-25T11:00:00Z',
          },
        },
      })

      expect(result).not.toBeNull()
      expect(result!.amount).toBe(1000)
      expect(result!.phone).toBeNull()
      expect(result!.upiReference).toBeNull()
      expect(result!.customerName).toBeNull()
      expect(result!.paymentLinkId).toBeNull()
    })
  })

  describe('reconcilePayment', () => {
    it('should try payment link match first and fall through on no match', async () => {
      const supabaseAdmin = await import('../supabase-admin')

      const single = vi.fn()
        .mockResolvedValueOnce({ data: null, error: null })
        .mockResolvedValueOnce({ data: null, error: null })

      const order = vi.fn().mockReturnValue({ data: [], error: null })

      vi.mocked(supabaseAdmin.supabaseAdmin.from).mockReturnValue(
        mockChain({ single, order })
      )

      const { reconcilePayment } = await import('../reconciliation')
      const signal = {
        amount: 5000,
        currency: 'INR',
        phone: '9876543210',
        upiReference: null,
        customerName: 'Rajesh Kumar',
        provider: 'razorpay',
        providerPaymentId: 'pay_mock_003',
        paymentLinkId: 'plink_test_001',
        timestamp: new Date().toISOString(),
        rawPayload: {},
      }

      const result = await reconcilePayment(signal, 'tenant_test_123')
      expect(result.matched).toBe(false)
      expect(result.invoiceId).toBeNull()
    })

    it('should match via payment_link_id when found', async () => {
      const supabaseAdmin = await import('../supabase-admin')

      const single = vi.fn()
        .mockResolvedValueOnce({
          data: { id: 'inv_link_match', total: 5000, paid_amount: 0, status: 'unpaid' },
          error: null,
        })

      vi.mocked(supabaseAdmin.supabaseAdmin.from).mockReturnValue(
        mockChain({ single })
      )

      const { reconcilePayment } = await import('../reconciliation')
      const signal = {
        amount: 5000,
        currency: 'INR',
        phone: null,
        upiReference: null,
        customerName: null,
        provider: 'razorpay',
        providerPaymentId: 'pay_mock_link',
        paymentLinkId: 'plink_exact',
        timestamp: new Date().toISOString(),
        rawPayload: {},
      }

      const result = await reconcilePayment(signal, 'tenant_test_123')
      expect(result.matched).toBe(true)
      expect(result.invoiceId).toBe('inv_link_match')
      expect(result.matchType).toBe('payment_link')
      expect(result.confidence).toBe(1.0)
    })

    it('should return unmatched when no match found anywhere', async () => {
      const supabaseAdmin = await import('../supabase-admin')

      const single = vi.fn()
        .mockResolvedValueOnce({ data: null, error: null })

      const order = vi.fn().mockReturnValue({ data: [], error: null })

      vi.mocked(supabaseAdmin.supabaseAdmin.from).mockReturnValue(
        mockChain({ single, order })
      )

      const { reconcilePayment } = await import('../reconciliation')
      const signal = {
        amount: 5000,
        currency: 'INR',
        phone: null,
        upiReference: null,
        customerName: null,
        provider: 'razorpay',
        providerPaymentId: 'pay_mock_004',
        paymentLinkId: null,
        timestamp: new Date().toISOString(),
        rawPayload: {},
      }

      const result = await reconcilePayment(signal, 'tenant_test_123')
      expect(result.matched).toBe(false)
      expect(result.invoiceId).toBeNull()
      expect(result.confidence).toBe(0)
    })
  })

  describe('processRazorpayPaymentWebhook', () => {
    it('should throw on invalid payload', async () => {
      const { processRazorpayPaymentWebhook } = await import('../reconciliation')
      await expect(processRazorpayPaymentWebhook({}, 'tenant_test_123'))
        .rejects.toThrow('Invalid payment webhook payload')
    })

    it('should process valid webhook payload with idempotency', async () => {
      const supabaseAdmin = await import('../supabase-admin')

      const single = vi.fn()
        .mockResolvedValueOnce({ data: null, error: null })

      const order = vi.fn().mockReturnValue({ data: [], error: null })

      vi.mocked(supabaseAdmin.supabaseAdmin.from).mockReturnValue(
        mockChain({ single, order })
      )

      const { processRazorpayPaymentWebhook } = await import('../reconciliation')
      const result = await processRazorpayPaymentWebhook(
        {
          payment: {
            entity: {
              id: 'pay_mock_005',
              amount: 200000,
              currency: 'INR',
              created_at: '2026-05-25T12:00:00Z',
            },
          },
        },
        'tenant_test_123'
      )

      expect(result.matched).toBe(false)
    })
  })
})
