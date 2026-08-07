import { describe, it, expect } from 'vitest'
import {
  deriveRecoveryState,
  deriveWhyLines,
  dominantAction,
} from '@/lib/billzo/reminder-state'

describe('deriveRecoveryState — monotonic recovery-state machine', () => {
  it('defaults to not_sent', () => {
    expect(deriveRecoveryState({}).id).toBe('not_sent')
    expect(deriveRecoveryState(null).id).toBe('not_sent')
  })

  it('maps the most advanced WhatsApp delivery milestone (read > delivered > sent)', () => {
    expect(deriveRecoveryState({ maxDeliveryStatus: 'sent' }).id).toBe('sent')
    expect(deriveRecoveryState({ maxDeliveryStatus: 'delivered' }).id).toBe('delivered')
    expect(deriveRecoveryState({ maxDeliveryStatus: 'read' }).id).toBe('read')
  })

  it('promise never regresses to read/delivered/sent (a later read is irrelevant)', () => {
    expect(deriveRecoveryState({ hasActivePromise: true, maxDeliveryStatus: 'read' }).id).toBe('promised')
    expect(deriveRecoveryState({ hasActivePromise: true, maxDeliveryStatus: 'delivered' }).id).toBe('promised')
    expect(deriveRecoveryState({ hasActivePromise: true }).id).toBe('promised')
  })

  it('paid is the highest milestone and wins over promise + read', () => {
    expect(deriveRecoveryState({ isPaid: true, hasActivePromise: true, maxDeliveryStatus: 'read' }).id).toBe('paid')
    expect(deriveRecoveryState({ isPaid: true }).id).toBe('paid')
  })

  it('shows phone_missing as a blocker when there is no phone and no higher milestone', () => {
    expect(deriveRecoveryState({ hasPhone: false }).id).toBe('phone_missing')
    expect(deriveRecoveryState({ hasPhone: false, maxDeliveryStatus: 'sent' }).id).toBe('phone_missing')
  })

  it('paid outranks a missing phone', () => {
    expect(deriveRecoveryState({ hasPhone: false, isPaid: true }).id).toBe('paid')
  })
})

describe('deriveWhyLines — answer "why is this customer here?"', () => {
  it('lists broken promise, ignored reminders and overdue, capped at 2', () => {
    const lines = deriveWhyLines({
      brokenPromises: 1,
      ignoredReminders: 2,
      overdueDays: 28,
    })
    expect(lines[0]).toBe('Promise not kept')
    expect(lines.length).toBeLessThanOrEqual(2)
  })

  it('shows promise timing when one is active', () => {
    expect(deriveWhyLines({ hasActivePromise: true, promiseDueDays: 0 })).toContain('Promise due today')
    expect(deriveWhyLines({ hasActivePromise: true, promiseDueDays: -1 })).toContain('Promise overdue')
    expect(deriveWhyLines({ hasActivePromise: true, promiseDueDays: 2 })).toContain('Promise in 2d')
  })

  it('falls back to a default when nothing specific applies', () => {
    expect(deriveWhyLines({})).toEqual(['Awaiting first reminder'])
  })
})

describe('dominantAction — one emphasised action, never surprising', () => {
  it('suggests WhatsApp by default', () => {
    expect(dominantAction({})).toBe('whatsapp')
  })

  it('suggests a call for a broken promise', () => {
    expect(dominantAction({ brokenPromises: 1 })).toBe('call')
  })

  it('suggests a call when a promise is due or overdue now', () => {
    expect(dominantAction({ hasActivePromise: true, promiseDueDays: 0 })).toBe('call')
    expect(dominantAction({ hasActivePromise: true, promiseDueDays: -3 })).toBe('call')
  })

  it('keeps WhatsApp as the hint for an upcoming promise', () => {
    expect(dominantAction({ hasActivePromise: true, promiseDueDays: 2 })).toBe('whatsapp')
  })

  it('routes a missing phone to Open Customer (add number)', () => {
    expect(dominantAction({ hasPhone: false })).toBe('open_customer')
  })

  it('returns null for a paid customer (nothing to do)', () => {
    expect(dominantAction({ isPaid: true })).toBeNull()
  })
})