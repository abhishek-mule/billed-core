import { describe, it, expect } from 'vitest'
import { recommend, actionLabel, type RecommendationInput } from '@/lib/recovery/recommendation-engine'

const now = new Date('2025-07-20T10:00:00Z')
const daysAgo = (d: number) => new Date(now.getTime() - d * 86400000).toISOString()

function base(over: Partial<RecommendationInput> = {}): RecommendationInput {
  return {
    rc: {
      totalOutstanding: 18000,
      totalOverdue: 18,
      state: 'overdue',
      promiseToPayDate: null,
      brokenPromises: 0,
      lastPaymentAt: null,
      nextActionType: 'send_reminder',
    },
    signals: { reminderCount: 1, undeliveredReminders: 0, lastReminderReadAt: daysAgo(1) },
    now,
    ...over,
  }
}

describe('recommendation-engine', () => {
  it('recommends none when recovered', () => {
    const r = recommend(base({ rc: { totalOutstanding: 0, totalOverdue: 0, state: 'recovered', promiseToPayDate: null, brokenPromises: 0, lastPaymentAt: null, nextActionType: 'none' } }))
    expect(r.action).toBe('none')
    expect(r.confidence).toBe('high')
  })

  it('recommends call on broken promise + read reminder', () => {
    const r = recommend(base({
      rc: { totalOutstanding: 18000, totalOverdue: 32, state: 'promised', promiseToPayDate: daysAgo(2), brokenPromises: 1, lastPaymentAt: null, nextActionType: 'send_reminder' },
      signals: { reminderCount: 2, undeliveredReminders: 0, lastReminderReadAt: daysAgo(1) },
    }))
    expect(r.action).toBe('call')
    expect(r.confidence).toBe('high')
    expect(r.reasons.join(' ')).toMatch(/broken/i)
    expect(r.reasons.join(' ')).toMatch(/opened the reminder/i)
  })

  it('recommends call when overdue > 30', () => {
    const r = recommend(base({ rc: { totalOutstanding: 5000, totalOverdue: 45, state: 'overdue', promiseToPayDate: null, brokenPromises: 0, lastPaymentAt: null, nextActionType: 'send_reminder' } }))
    expect(r.action).toBe('call')
  })

  it('recommends resend when reminder undelivered', () => {
    const r = recommend(base({
      rc: { totalOutstanding: 3000, totalOverdue: 5, state: 'active', promiseToPayDate: null, brokenPromises: 0, lastPaymentAt: null, nextActionType: 'send_reminder' },
      signals: { reminderCount: 1, undeliveredReminders: 1, lastReminderDeliveredAt: null },
    }))
    expect(r.action).toBe('resend')
  })

  it('recommends follow_up_call for promise_followup action', () => {
    const r = recommend(base({
      action: { actionType: 'promise_followup', status: 'scheduled', scheduledAt: now.toISOString() },
      signals: { reminderCount: 1, undeliveredReminders: 0, lastReminderReadAt: daysAgo(2) },
    }))
    expect(r.action).toBe('follow_up_call')
  })

  it('recommends reminder when fresh and unread', () => {
    const r = recommend(base({
      rc: { totalOutstanding: 2000, totalOverdue: 3, state: 'active', promiseToPayDate: null, brokenPromises: 0, lastPaymentAt: null, nextActionType: 'send_reminder' },
      signals: { reminderCount: 0, undeliveredReminders: 0 },
    }))
    expect(r.action).toBe('send_reminder')
  })

  it('actionLabel maps correctly', () => {
    expect(actionLabel('call')).toBe('Call')
    expect(actionLabel('resend')).toBe('Re-send Reminder')
    expect(actionLabel('none')).toBe('No Action')
  })
})
