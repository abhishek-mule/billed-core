import { describe, it, expect } from 'vitest'
import { calculateDaysOverdue, isOverdue, describeOverdue } from '../days-overdue'
import { getRecommendedAction } from '../recommended-action'

describe('days-overdue (canonical calculation)', () => {
  it('returns 0 for null/undefined/invalid dates', () => {
    expect(calculateDaysOverdue(null)).toBe(0)
    expect(calculateDaysOverdue(undefined)).toBe(0)
    expect(calculateDaysOverdue('not-a-date')).toBe(0)
  })

  it('returns 0 for future dates', () => {
    const future = new Date(Date.now() + 10 * 86400000).toISOString()
    expect(calculateDaysOverdue(future)).toBe(0)
  })

  it('returns 0 when due today', () => {
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    expect(calculateDaysOverdue(todayStart.toISOString())).toBe(0)
  })

  it('uses day-boundary comparison, not raw ms floor', () => {
    // Due yesterday 23:59, now today 00:01 → 1 day overdue (raw ms floor would say 0)
    const now = new Date()
    const yesterdayLate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59)
    expect(calculateDaysOverdue(yesterdayLate.toISOString())).toBe(1)
  })

  it('counts full days overdue', () => {
    const now = new Date()
    const fiveDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 5)
    expect(calculateDaysOverdue(fiveDaysAgo.toISOString())).toBe(5)
  })

  it('isOverdue / describeOverdue helpers agree', () => {
    expect(isOverdue(null)).toBe(false)
    expect(describeOverdue(null)).toBe('Due today')
    const d = describeOverdue(new Date(Date.now() - 3 * 86400000).toISOString())
    expect(d).toBe('3 days overdue')
  })
})

describe('recommended-action engine', () => {
  const base = {
    overdueDays: 5,
    brokenPromises: 0,
    ignoredReminders: 0,
    hasActivePromise: false,
    hasPhone: true,
    maxDeliveryStatus: null,
  }

  it('paid customer → no action', () => {
    const r = getRecommendedAction({ ...base, isPaid: true })
    expect(r.action).toBe('none')
    expect(r.urgency).toBe('low')
  })

  it('no phone → add number is the blocker action', () => {
    const r = getRecommendedAction({ ...base, hasPhone: false })
    expect(r.action).toBe('open_customer')
    expect(r.label).toContain('Phone')
    expect(r.urgency).toBe('high')
  })

  it('broken promise → call today, high urgency', () => {
    const r = getRecommendedAction({ ...base, brokenPromises: 1 })
    expect(r.action).toBe('call')
    expect(r.urgency).toBe('high')
    expect(r.reason).toContain('broken promise')
  })

  it('overdue promise date → call', () => {
    const past = new Date(Date.now() - 2 * 86400000).toISOString()
    const r = getRecommendedAction({ ...base, hasActivePromise: true, promiseToPayDate: past })
    expect(r.action).toBe('call')
    expect(r.urgency).toBe('high')
  })

  it('upcoming promise → whatsapp reminder, not call', () => {
    const soon = new Date(Date.now() + 2 * 86400000).toISOString()
    const r = getRecommendedAction({ ...base, hasActivePromise: true, promiseToPayDate: soon })
    expect(r.action).toBe('whatsapp')
    expect(r.urgency).toBe('medium')
  })

  it('48 days overdue → call today with reason naming the days', () => {
    const r = getRecommendedAction({ ...base, overdueDays: 48 })
    expect(r.action).toBe('call')
    expect(r.urgency).toBe('high')
    expect(r.reason).toContain('48 days')
  })

  it('17 days overdue → call (escalated), orange urgency', () => {
    const r = getRecommendedAction({ ...base, overdueDays: 17 })
    expect(r.action).toBe('call')
    expect(r.color).toBe('orange')
  })

  it('3 days overdue → whatsapp reminder', () => {
    const r = getRecommendedAction({ ...base, overdueDays: 3 })
    expect(r.action).toBe('whatsapp')
    expect(r.reason).toContain('3 days')
  })

  it('read-but-ignored reminder escalates to call even when only slightly overdue', () => {
    const r = getRecommendedAction({ ...base, overdueDays: 3, maxDeliveryStatus: 'read', ignoredReminders: 2 })
    expect(r.action).toBe('call')
  })

  it('not yet overdue → no action needed', () => {
    const r = getRecommendedAction({ ...base, overdueDays: 0 })
    expect(r.action).toBe('none')
  })

  it('every non-none recommendation carries an alternative', () => {
    for (const input of [
      { ...base, overdueDays: 48 },
      { ...base, overdueDays: 17 },
      { ...base, overdueDays: 3 },
      { ...base, brokenPromises: 2 },
    ]) {
      const r = getRecommendedAction(input)
      expect(r.alternative).toBeDefined()
    }
  })
})
