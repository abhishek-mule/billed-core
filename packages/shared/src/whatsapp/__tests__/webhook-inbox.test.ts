import { describe, it, expect } from 'vitest'
import { buildInboxRows, sanitizeRaw, type WebhookInboxRow } from '..'

const payload = (row: WebhookInboxRow) => row.payload as unknown as Record<string, any>

describe('buildInboxRows — row shaping for webhook_inbox', () => {
  it('turns a Gupshup message event into one durable inbox row', () => {
    const rows = buildInboxRows(
      [
        {
          eventType: 'customer_message',
          phoneNumberId: 'ph_1',
          messages: [{ id: 'm1', from: '919999999999', text: 'hi', timestamp: '1700000000' }],
        },
      ],
      'gupshup',
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      provider: 'gupshup',
      provider_event_id: 'm1',
      provider_event_type: 'customer_message',
      phone_number_id: 'ph_1',
      status: 'queued',
    })
    expect(payload(rows[0]).messages[0].id).toBe('m1')
    expect(payload(rows[0]).eventType).toBe('customer_message')
    expect(rows[0].payload_raw).toBeNull()
  })

  it('flattens multiple messages into multiple rows', () => {
    const rows = buildInboxRows(
      [
        {
          eventType: 'customer_message',
          phoneNumberId: 'ph_1',
          messages: [
            { id: 'm1', from: '91', text: 'a' },
            { id: 'm2', from: '92', text: 'b' },
          ],
        },
      ],
      'gupshup',
    )
    expect(rows.map((r) => r.provider_event_id)).toEqual(['m1', 'm2'])
  })

  it('uses messageId:status as the idempotency key for status events', () => {
    const rows = buildInboxRows(
      [
        {
          eventType: 'status',
          phoneNumberId: 'ph_1',
          statuses: [{ id: 's1', status: 'delivered', timestamp: '1700000000' }],
        },
      ],
      'gupshup',
    )
    expect(rows[0]).toMatchObject({
      provider_event_id: 's1:delivered',
      provider_event_type: 'status',
      phone_number_id: 'ph_1',
    })
    expect(payload(rows[0]).statuses[0]).toMatchObject({ id: 's1', status: 'delivered' })
  })

  it('keeps the delivered/read pair on the same message distinct', () => {
    const rows = buildInboxRows(
      [
        {
          eventType: 'status',
          phoneNumberId: 'ph_1',
          statuses: [
            { id: 's1', status: 'delivered' },
            { id: 's1', status: 'read' },
          ],
        },
      ],
      'gupshup',
    )
    expect(rows.map((r) => r.provider_event_id)).toEqual(['s1:delivered', 's1:read'])
  })

  it('never produces a NULL idempotency key for a status without a provider id', () => {
    const rows = buildInboxRows(
      [{ eventType: 'status', phoneNumberId: 'ph_1', statuses: [{ status: 'failed' }] }],
      'meta',
    )
    expect(rows[0].provider_event_id).toBe('no-id:failed')
  })

  it('never produces a NULL idempotency key for a message without a provider id', () => {
    const rows = buildInboxRows(
      [{ eventType: 'customer_message', phoneNumberId: 'ph_1', messages: [{ from: '91' }] }],
      'gupshup',
    )
    expect(rows[0].provider_event_id).toBe('no-id')
  })

  it('maps merchant echoes to merchant_echo events', () => {
    const rows = buildInboxRows(
      [{ eventType: 'merchant_echo', phoneNumberId: 'ph_1', messages: [{ id: 'e1', to: '91' }] }],
      'gupshup',
    )
    expect(rows[0]).toMatchObject({
      provider_event_type: 'merchant_echo',
      provider_event_id: 'e1',
    })
  })

  it('propagates the provider identity', () => {
    const rows = buildInboxRows(
      [{ eventType: 'customer_message', phoneNumberId: 'ph_1', messages: [{ id: 'm1' }] }],
      'meta',
    )
    expect(rows[0].provider).toBe('meta')
  })
})

describe('buildInboxRows — sanitized payload contract', () => {
  const event = (extra: Record<string, unknown> = {}) => ({
    eventType: 'customer_message' as const,
    phoneNumberId: 'ph_1',
    messages: [{ id: 'm1', from: '91', text: 'hi', api_token: 'nope' }],
    ...extra,
  })

  it('redacts credential-shaped keys from the reproduction payload', () => {
    const [row] = buildInboxRows([event()], 'gupshup')
    expect(payload(row).messages[0].api_token).toBe('[redacted]')
    expect(JSON.stringify(payload(row))).not.toContain('nope')
  })

  it('truncates long strings within the payload', () => {
    const [row] = buildInboxRows([event({ messages: [{ id: 'm1', from: '91', text: 'x'.repeat(600) }] })], 'gupshup')
    expect(payload(row).messages[0].text).toHaveLength(500 + 1)
  })

  it('sanitizes the forensic raw envelope the same way', () => {
    const raw = { event: 'message', api_key: 'SHOULD-NOT-PERSIST', data: { phone_number_id: 'ph_1' } }
    const [row] = buildInboxRows([event()], 'gupshup', raw)
    expect(row.payload_raw!.api_key).toBe('[redacted]')
    expect(JSON.stringify(row.payload_raw)).not.toContain('SHOULD-NOT-PERSIST')
  })
})

describe('sanitizeRaw boundary (as frozen in the domain suite)', () => {
  it('binds arrays to 20 items', () => {
    const out = sanitizeRaw({ many: Array.from({ length: 30 }, (_, i) => i) })!
    expect(out.many).toHaveLength(20)
  })

  it('caps aggregate serialized size to 16,000 bytes', () => {
    const out = sanitizeRaw(Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`k${i}`, 'x'.repeat(2000)])))!
    expect(out).toMatchObject({ truncated: true })
    expect((out as { head: string }).head.length).toBe(16000)
  })
})