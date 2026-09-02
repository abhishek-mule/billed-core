import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../supabase-admin', () => ({
  supabaseAdmin: { from: vi.fn() },
}))

vi.mock('../redis', () => ({
  createRedisClient: vi.fn(() => ({
    exists: vi.fn().mockResolvedValue(0),
  })),
}))

import { sendDirectWhatsApp } from '../whatsapp-send-direct'
import { supabaseAdmin } from '../supabase-admin'
import { MetaAdapter } from '@billzo/shared'

const sendMock = vi.fn()

vi.mock('@billzo/shared', () => ({
  TransportRegistry: class {
    register() { return this }
    async send(_channelId: string, outbound: any) {
      return sendMock(outbound)
    }
  },
  MetaAdapter: class {},
  GupshupAdapter: class {},
  SimulationAdapter: class {},
}))

function mockChain(terminal: Record<string, any> = {}) {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    insert: vi.fn().mockResolvedValue({ error: null }),
    update: vi.fn(() => chain),
    ...terminal,
  }
  return chain
}

describe('sendDirectWhatsApp — Meta via shared TransportRegistry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.META_ACCESS_TOKEN = 'test-meta-token'
    process.env.META_PHONE_NUMBER_ID = '1229387453587153'
    process.env.META_WABA_ID = '1364023779201918'
    sendMock.mockResolvedValue({ success: true, providerMessageId: 'wamid_meta_001', latencyMs: 10 })
  })

  afterEach(() => {
    delete process.env.META_ACCESS_TOKEN
    delete process.env.META_PHONE_NUMBER_ID
    delete process.env.META_WABA_ID
  })

  it('resolves Meta provider from whatsapp_connections and sends', async () => {
    ;(supabaseAdmin.from as any).mockImplementation((table: string) => {
      if (table === 'whatsapp_connections') {
        return mockChain({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { provider: 'meta', phone_number_id: '1229387453587153', status: 'connected' },
            error: null,
          }),
        })
      }
      return mockChain()
    })

    const result = await sendDirectWhatsApp(
      'tenant_1',
      'cust_1',
      'Hello Rahul, reminder from BillZo.',
      { customerPhone: '919371343891', invoiceId: 'inv_1' },
    )

    expect(result.success).toBe(true)
    expect((result as any).sentVia).toBe('meta')
    expect(sendMock).toHaveBeenCalledWith(expect.objectContaining({
      to: '919371343891',
      text: 'Hello Rahul, reminder from BillZo.',
    }))
    // event recorded into whatsapp_events
    expect(supabaseAdmin.from).toHaveBeenCalledWith('whatsapp_events')
  })

  it('returns error when no provider can be resolved', async () => {
    delete process.env.META_ACCESS_TOKEN
    delete process.env.META_PHONE_NUMBER_ID
    ;(supabaseAdmin.from as any).mockReturnValue(mockChain())

    const result = await sendDirectWhatsApp(
      'tenant_1',
      'cust_1',
      'Hello',
      { customerPhone: '919371343891' },
    )

    expect(result.success).toBe(false)
    expect((result as any).error).toContain('No active WhatsApp connection')
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('propagates Meta API errors as failures', async () => {
    ;(supabaseAdmin.from as any).mockImplementation((table: string) => {
      if (table === 'whatsapp_connections') {
        return mockChain({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { provider: 'meta', phone_number_id: '1229387453587153', status: 'connected' },
            error: null,
          }),
        })
      }
      return mockChain()
    })
    sendMock.mockResolvedValueOnce({
      success: false,
      providerMessageId: null,
      latencyMs: 5,
      error: '(#131030) Recipient phone number not in allowed list',
    })

    const result = await sendDirectWhatsApp(
      'tenant_1',
      'cust_1',
      'Hello',
      { customerPhone: '919371343891', invoiceId: 'inv_2' },
    )

    expect(result.success).toBe(false)
    expect((result as any).error).toContain('131030')
  })
})
