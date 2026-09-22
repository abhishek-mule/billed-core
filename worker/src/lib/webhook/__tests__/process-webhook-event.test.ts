import { describe, it, expect } from 'vitest'
import { createWebhookEventProcessor } from '../process-webhook-event'
import { connectionRow, makeFakeClient } from './fake-client'

describe('createWebhookEventProcessor — tenant boundary', () => {
  it('resolves tenant via phone_number_id and processes a customer_message', async () => {
    const fake = makeFakeClient({
      tables: {
        whatsapp_connections: [connectionRow()],
        customers: [{ id: 'c1', tenant_id: 't1' }],
      },
    })
    const process = createWebhookEventProcessor(fake.client)
    await process({
      eventType: 'customer_message',
      phoneNumberId: 'ph_1',
      wabaId: 'waba_1',
      messages: [
        {
          id: 'm_1',
          from: '919371343891',
          timestamp: '1700000000',
          type: 'text',
          text: 'hi',
          contextId: 'wamid_parent',
        },
      ],
    })

    // whatsapp_connections is consulted BEFORE anything else drains through
    // domain writes (server-authoritative resolution).
    const order = fake.calls.map((c) => c.table ?? c.op).filter((t) => t !== 'select' && t !== 'eq' && t !== 'limit' && t !== 'or' && t !== 'not' && t !== 'filter')
    expect(order[0]).toBe('whatsapp_connections')

    const writes = fake.calls.filter((c) => c.op === 'insert' || c.op === 'upsert' || c.op === 'update')
    expect(writes.some((c) => c.table === 'whatsapp_events')).toBe(true)
    expect(writes.some((c) => c.table === 'recovery_outcomes')).toBe(true)
    expect(writes.some((c) => c.table === 'pilot_events')).toBe(true)
  })

  it('unknown phone_number_id records unattributed_webhook and stops (no domain writes)', async () => {
    const fake = makeFakeClient({ tables: { customers: [{ id: 'c1' }] } })
    const process = createWebhookEventProcessor(fake.client)
    await process({
      eventType: 'customer_message',
      phoneNumberId: 'unknown_ph',
      messages: [{ id: 'm_x', from: '919371343891' }],
    })

    const writes = fake.calls.filter((c) => c.op === 'insert')
    expect(writes).toHaveLength(1)
    expect(writes[0].table).toBe('pilot_events')
    const pilot = writes[0].rows as any
    expect(pilot.event_kind).toBe('unattributed_webhook')
    expect(pilot.attribution_result).toBe('unattributed')
    expect(pilot.provider_message_id).toBe('m_x')
  })
})

describe('createWebhookEventProcessor — branch shape', () => {
  it('customer_message without a customer match records customer_unmatched pilot', async () => {
    const fake = makeFakeClient({
      tables: { whatsapp_connections: [connectionRow()], customers: [] },
    })
    const process = createWebhookEventProcessor(fake.client)
    await process({
      eventType: 'customer_message',
      phoneNumberId: 'ph_1',
      messages: [{ id: 'm_2', from: '999000111', timestamp: '1700000001' }],
    })

    const pilots = fake.calls.filter((c) => c.op === 'insert' && c.table === 'pilot_events')
    expect(pilots).toHaveLength(1)
    expect((pilots[0].rows as any).attribution_result).toBe('customer_unmatched')
    expect((pilots[0].rows as any).customer_id).toBeNull()
  })

  it('merchant_echo persists the echo and records merchant_app_reply', async () => {
    const fake = makeFakeClient({
      tables: {
        whatsapp_connections: [connectionRow()],
        customers: [{ id: 'c1', tenant_id: 't1' }],
      },
    })
    const process = createWebhookEventProcessor(fake.client)
    await process({
      eventType: 'merchant_echo',
      phoneNumberId: 'ph_1',
      messages: [{ id: 'm_3', to: '919371343891', timestamp: '1700000002', type: 'text', text: 'ok' }],
    })

    const writes = fake.calls.filter((c) => c.op === 'insert')
    expect(writes.some((c) => c.table === 'whatsapp_events')).toBe(true)
    const echo = writes.find((c) => c.table === 'whatsapp_events')!.rows as any
    expect(echo.direction).toBe('outbound')
    expect(echo.message_type).toBe('merchant_app_reply')

    const pilots = fake.calls.filter((c) => c.op === 'insert' && c.table === 'pilot_events')
    expect(pilots).toHaveLength(1)
    expect((pilots[0].rows as any).event_kind).toBe('merchant_app_reply')
  })

  it('status event updates delivery and records message_status pilot', async () => {
    const fake = makeFakeClient({
      tables: {
        whatsapp_connections: [connectionRow()],
        whatsapp_events: [
          {
            tenant_id: 't1',
            recovery_attempt_id: 'a1',
            invoice_id: 'inv_1',
            customer_id: 'c1',
            provider_message_id: 'wamid_msg',
          },
        ],
      },
    })
    const process = createWebhookEventProcessor(fake.client)
    await process({
      eventType: 'status',
      phoneNumberId: 'ph_1',
      statuses: [{ id: 'wamid_msg', status: 'delivered', timestamp: '1700000003' }],
    })

    const updates = fake.calls.filter((c) => c.op === 'update')
    expect(updates.some((c) => c.table === 'whatsapp_events')).toBe(true)

    const pilots = fake.calls.filter((c) => c.op === 'insert' && c.table === 'pilot_events')
    expect(pilots).toHaveLength(1)
    expect((pilots[0].rows as any).event_kind).toBe('message_status')
    expect((pilots[0].rows as any).provider_status).toBe('delivered')

    const outcomes = fake.calls.filter((c) => c.op === 'upsert' && c.table === 'recovery_outcomes')
    expect(outcomes).toHaveLength(1)
    expect((outcomes[0].rows as any).outcome_type).toBe('delivered')
  })
})