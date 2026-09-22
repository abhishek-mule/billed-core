import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventType } from '@billzo/shared'
import { tryHandleSendMessageIntent } from '../send-message-handler'

// B-05b: pre-execution send guard. A duplicate claim miss must not double-text
// the customer: the first execution's processed_jobs marker (UNIQUE on
// idempotency_key, enforced by migration 102) makes the second a silent skip.
const mocks = vi.hoisted(() => ({
  sendWhatsAppMessage: vi.fn(),
}))

vi.mock('../../../../lib/whatsapp-router', () => ({
  sendWhatsAppMessage: mocks.sendWhatsAppMessage,
}))

const { sendWhatsAppMessage } = mocks

const state = vi.hoisted(() => ({
  markerInsert: { error: null as any },
}))

function chainFor(table: string): any {
  if (table === 'processed_jobs') {
    return {
      insert: vi.fn(() => Promise.resolve(state.markerInsert)),
      delete: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ error: null })),
      })),
    }
  }
  if (table === 'customers') {
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() =>
            Promise.resolve({
              data: { customer_name: 'Raj', whatsapp_number: '919876543210' },
              error: null,
            }),
          ),
        })),
      })),
    }
  }
  if (table === 'tenants') {
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() =>
            Promise.resolve({ data: { company_name: 'Shop', whatsapp_config: {} }, error: null }),
          ),
        })),
      })),
    }
  }
  if (table === 'invoices') {
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            neq: vi.fn(() => ({
              order: vi.fn(() => Promise.resolve({ data: [], error: null })),
            })),
          })),
        })),
        maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
      })),
    }
  }
  if (table === 'whatsapp_events') {
    return { insert: vi.fn(() => Promise.resolve({ error: null })) }
  }
  if (table === 'outbox') {
    return {
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: { id: 'followup' }, error: null })),
        })),
      })),
    }
  }
  throw new Error(`unexpected table in send-guard test: ${table}`)
}

vi.mock('../supabase-admin', () => ({
  supabaseAdmin: { from: vi.fn((table: string) => chainFor(table)) },
}))

function sendEvent() {
  return {
    id: 'outbox-evt-1',
    type: EventType.SEND_MESSAGE_INTENDED,
    tenantId: 't1',
    entityId: null,
    correlationId: 'corr1',
    payload: { customerId: 'c1', message: 'Please pay your invoice' },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  state.markerInsert = { error: null }
  sendWhatsAppMessage.mockResolvedValue({
    messageId: 'wamid.test',
    provider: 'gupshup',
    identity: {
      billzoMessageId: 'b1',
      conversationId: 'conv1',
      eventSequence: 1,
      transportMessageHash: 'h',
      attemptNumber: 1,
    },
  })
})

describe('send pre-execution guard (B-05b)', () => {
  it('sends once when the marker is fresh', async () => {
    await tryHandleSendMessageIntent(sendEvent())
    expect(sendWhatsAppMessage).toHaveBeenCalledTimes(1)
  })

  it('skips the provider send when the marker already exists (23505)', async () => {
    state.markerInsert = { error: { code: '23505', message: 'duplicate key' } }
    await tryHandleSendMessageIntent(sendEvent())
    expect(sendWhatsAppMessage).not.toHaveBeenCalled()
  })

  it('throws (retry later) when the marker store itself fails', async () => {
    state.markerInsert = { error: { code: '08006', message: 'connection failure' } }
    await expect(tryHandleSendMessageIntent(sendEvent())).rejects.toThrow(/Send-marker/)
    expect(sendWhatsAppMessage).not.toHaveBeenCalled()
  })
})
