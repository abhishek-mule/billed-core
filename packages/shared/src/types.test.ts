import { describe, it, expect } from 'vitest'
import {
  normalizeStage,
  getNextStage,
  generateBillzoMessageId,
  generateEventSequence,
  computeTransportHash,
  REMINDER_STAGES,
  STAGE_LABELS,
  type ReminderStage,
} from './types'

describe('normalizeStage', () => {
  it('returns the stage as-is when valid', () => {
    expect(normalizeStage('t0_soft')).toBe('t0_soft')
    expect(normalizeStage('t24_nudge')).toBe('t24_nudge')
    expect(normalizeStage('t72_strong')).toBe('t72_strong')
    expect(normalizeStage('t5_warning')).toBe('t5_warning')
  })

  it('returns t0_soft for invalid stages', () => {
    expect(normalizeStage('invalid_stage')).toBe('t0_soft')
    expect(normalizeStage('')).toBe('t0_soft')
    expect(normalizeStage(null as unknown as string)).toBe('t0_soft')
    expect(normalizeStage(undefined as unknown as string)).toBe('t0_soft')
  })

  it('returns default for wrong case', () => {
    expect(normalizeStage('T0_SOFT')).toBe('t0_soft')
  })
})

describe('getNextStage', () => {
  it('returns the next stage in the cycle', () => {
    expect(getNextStage('t0_soft')).toBe('t24_nudge')
    expect(getNextStage('t24_nudge')).toBe('t72_strong')
    expect(getNextStage('t72_strong')).toBe('t5_warning')
  })

  it('returns the same stage for the last stage', () => {
    expect(getNextStage('t5_warning')).toBe('t5_warning')
  })
})

describe('REMINDER_STAGES', () => {
  it('contains exactly 4 stages', () => {
    expect(REMINDER_STAGES).toHaveLength(4)
    expect(REMINDER_STAGES).toEqual(['t0_soft', 't24_nudge', 't72_strong', 't5_warning'])
  })
})

describe('STAGE_LABELS', () => {
  it('has labels for all stages', () => {
    for (const stage of REMINDER_STAGES) {
      expect(STAGE_LABELS[stage as ReminderStage]).toBeDefined()
      expect(typeof STAGE_LABELS[stage as ReminderStage]).toBe('string')
    }
  })
})

describe('generateBillzoMessageId', () => {
  it('returns a string starting with bmsg_', () => {
    const id = generateBillzoMessageId()
    expect(id).toMatch(/^bmsg_[0-9a-z]+$/)
  })

  it('produces unique IDs on sequential calls', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateBillzoMessageId()))
    expect(ids.size).toBe(100)
  })
})

describe('generateEventSequence', () => {
  it('returns a BigInt', () => {
    const seq = generateEventSequence()
    expect(typeof seq).toBe('bigint')
  })

  it('produces increasing values on sequential calls', () => {
    const a = generateEventSequence()
    const b = generateEventSequence()
    expect(b > a).toBe(true)
  })
})

describe('computeTransportHash', () => {
  it('returns a 32-char hex string', () => {
    const hash = computeTransportHash({
      phone: '+919876543210',
      message: 'Hello',
      invoiceId: 'inv_123',
      amount: 500,
      reminderStage: 't0_soft',
      attemptNumber: 1,
    })
    expect(hash).toMatch(/^[0-9a-f]{32}$/)
  })

  it('produces deterministic output for same inputs', () => {
    const params = {
      phone: '+919876543210',
      message: 'Test message',
      invoiceId: 'inv_456',
      amount: 1000,
      reminderStage: 't24_nudge',
      attemptNumber: 2,
    }
    const a = computeTransportHash(params)
    const b = computeTransportHash(params)
    expect(a).toBe(b)
  })

  it('produces different output for different attempts', () => {
    const a = computeTransportHash({ phone: '+91', message: 'hi', attemptNumber: 1 })
    const b = computeTransportHash({ phone: '+91', message: 'hi', attemptNumber: 2 })
    expect(a).not.toBe(b)
  })

  it('handles minimal params', () => {
    const hash = computeTransportHash({ phone: '+91', message: 'test' })
    expect(hash).toMatch(/^[0-9a-f]{32}$/)
  })
})
