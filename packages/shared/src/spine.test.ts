import { describe, it, expect } from 'vitest'
import {
  validateSpineEventInput,
  uuidv7,
  uuidv7Timestamp,
  inferEntityType,
  type SpineEventInput,
} from './spine'

const validInput: SpineEventInput = {
  entity_type: 'invoice',
  entity_id: 'inv-123',
  source_system: 'worker',
  idempotency_key: 'tenant:invoice:inv-123:created:hash',
}

describe('uuidv7', () => {
  it('generates a valid v7 UUID format', () => {
    const id = uuidv7()
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('generates time-ordered UUIDs', () => {
    const ids = Array.from({ length: 10 }, () => uuidv7())
    const timestamps = ids.map(uuidv7Timestamp)
    for (let i = 1; i < timestamps.length; i++) {
      expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i - 1])
    }
  })

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => uuidv7()))
    expect(ids.size).toBe(1000)
  })
})

describe('validateSpineEventInput', () => {
  it('accepts a valid input', () => {
    expect(validateSpineEventInput(validInput)).toEqual([])
  })

  it('rejects null input', () => {
    const errors = validateSpineEventInput(null)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0].field).toBe('root')
  })

  it('rejects missing entity_type', () => {
    const errors = validateSpineEventInput({ ...validInput, entity_type: undefined })
    expect(errors.some(e => e.field === 'entity_type')).toBe(true)
  })

  it('rejects invalid entity_type', () => {
    const errors = validateSpineEventInput({ ...validInput, entity_type: 'foo' })
    expect(errors.some(e => e.field === 'entity_type')).toBe(true)
  })

  it('rejects missing entity_id', () => {
    const errors = validateSpineEventInput({ ...validInput, entity_id: '' })
    expect(errors.some(e => e.field === 'entity_id')).toBe(true)
  })

  it('rejects missing source_system', () => {
    const errors = validateSpineEventInput({ ...validInput, source_system: undefined })
    expect(errors.some(e => e.field === 'source_system')).toBe(true)
  })

  it('rejects invalid source_system', () => {
    const errors = validateSpineEventInput({ ...validInput, source_system: 'hacker' })
    expect(errors.some(e => e.field === 'source_system')).toBe(true)
  })

  it('rejects missing idempotency_key', () => {
    const errors = validateSpineEventInput({ ...validInput, idempotency_key: '' })
    expect(errors.some(e => e.field === 'idempotency_key')).toBe(true)
  })

  it('accepts null causal_id', () => {
    expect(validateSpineEventInput({ ...validInput, causal_id: null })).toEqual([])
  })

  it('rejects non-string causal_id', () => {
    const errors = validateSpineEventInput({ ...validInput, causal_id: 123 as any })
    expect(errors.some(e => e.field === 'causal_id')).toBe(true)
  })

  it('accepts with all optional fields', () => {
    const full: SpineEventInput = {
      entity_type: 'payment',
      entity_id: 'pay-456',
      causal_id: 'evt-001',
      correlation_id: 'corr-789',
      occurred_at: '2026-06-09T12:00:00Z',
      source_system: 'webhook',
      idempotency_key: 'razorpay:pay_abc123',
      payload: { amount: 5000 },
      external_refs: {
        razorpay_payment_id: 'pay_abc123',
      },
    }
    expect(validateSpineEventInput(full)).toEqual([])
  })

  it('rejects external_refs with wrong type', () => {
    const errors = validateSpineEventInput({ ...validInput, external_refs: 'not-an-object' as any })
    expect(errors.some(e => e.field === 'external_refs')).toBe(true)
  })
})

describe('inferEntityType', () => {
  it('maps invoice.created to invoice', () => {
    expect(inferEntityType('invoice.created')).toBe('invoice')
  })

  it('maps payment.completed to payment', () => {
    expect(inferEntityType('payment.completed')).toBe('payment')
  })

  it('maps recovery.reminder.sent to recovery_case', () => {
    expect(inferEntityType('recovery.reminder.sent')).toBe('recovery_case')
  })

  it('maps whatsapp.sent to whatsapp_message', () => {
    expect(inferEntityType('whatsapp.sent')).toBe('whatsapp_message')
  })

  it('maps unknown types to unknown', () => {
    expect(inferEntityType('foo.bar')).toBe('unknown')
  })
})
