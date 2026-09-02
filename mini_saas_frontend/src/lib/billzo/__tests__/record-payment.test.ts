import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../supabase-admin', () => ({
  supabaseAdmin: { from: vi.fn() },
}))

vi.mock('../outbox', () => ({
  writeOutboxEvent: vi.fn().mockResolvedValue('evt_001'),
}))

vi.mock('@/lib/recovery/planner', () => ({
  cancelFutureActions: vi.fn().mockResolvedValue(2),
}))

import { recordPayment } from '../record-payment'
import { supabaseAdmin } from '../supabase-admin'
import { writeOutboxEvent } from '../outbox'
import { cancelFutureActions } from '@/lib/recovery/planner'

function mockChain(terminal: Record<string, any> = {}) {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    insert: vi.fn().mockResolvedValue(terminal),
    update: vi.fn(() => chain),
    ...terminal,
  }
  return chain
}

describe('recordPayment — payment.completed outbox + cancelFutureActions chain', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('inserts payment, emits payment.completed, cancels future actions', async () => {
    ;(supabaseAdmin.from as any).mockReturnValue(mockChain({ error: null }))

    const result = await recordPayment({
      tenantId: 'tenant_1',
      invoiceId: 'inv_1',
      customerId: 'cust_1',
      amount: 5000,
      source: 'upi',
      sourceId: 'upi_ref_1',
      actor: 'system',
    })

    expect(result).toEqual({ paymentId: expect.any(String) })
    expect(supabaseAdmin.from).toHaveBeenCalledWith('payments')
    expect(writeOutboxEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'payment.completed',
      tenantId: 'tenant_1',
      entityId: 'inv_1',
      payload: expect.objectContaining({ customerId: 'cust_1', amount: 5000, paymentId: expect.any(String) }),
    }))
    expect(cancelFutureActions).toHaveBeenCalledWith('inv_1', 'tenant_1')
  })

  it('returns error and skips outbox/cancel when insert fails', async () => {
    ;(supabaseAdmin.from as any).mockReturnValue(mockChain({ error: { message: 'duplicate' } }))

    const result = await recordPayment({
      tenantId: 'tenant_1',
      invoiceId: 'inv_1',
      customerId: 'cust_1',
      amount: 100,
      source: 'cash',
      actor: 'system',
    })

    expect(result).toEqual({ error: 'duplicate' })
    expect(writeOutboxEvent).not.toHaveBeenCalled()
    expect(cancelFutureActions).not.toHaveBeenCalled()
  })

  it('B3 — threads recoveryAttemptId into payment.completed when known', async () => {
    ;(supabaseAdmin.from as any).mockReturnValue(mockChain({ error: null }))

    await recordPayment({
      tenantId: 'tenant_1',
      invoiceId: 'inv_1',
      customerId: 'cust_1',
      amount: 5000,
      source: 'upi',
      actor: 'customer',
      recoveryAttemptId: 'CA_attempt_1',
    })

    const event = vi.mocked(writeOutboxEvent).mock.calls[0][0] as any
    expect(event.type).toBe('payment.completed')
    expect(event.payload.recoveryAttemptId).toBe('CA_attempt_1')
  })

  it('B3 — hostile case preserved: no explicit attempt ⇒ payload carries null, never guessed', async () => {
    ;(supabaseAdmin.from as any).mockReturnValue(mockChain({ error: null }))

    await recordPayment({
      tenantId: 'tenant_1',
      invoiceId: 'inv_1',
      customerId: 'cust_1',
      amount: 5000,
      source: 'upi',
      actor: 'customer',
    })

    const event = vi.mocked(writeOutboxEvent).mock.calls[0][0] as any
    expect(event.payload.recoveryAttemptId).toBeNull()
    expect(event.payload.recoveryAttemptId).not.toBe('CA_attempt_1')
  })
})
