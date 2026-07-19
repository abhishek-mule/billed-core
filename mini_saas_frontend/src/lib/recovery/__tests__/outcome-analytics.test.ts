import { describe, it, expect } from 'vitest'
import { computeOutcomeAnalytics } from '@/lib/recovery/outcome-analytics'

const day = (d: number) => new Date(Date.now() + d * 86400000).toISOString()

describe('outcome-analytics', () => {
  it('measures reminder outcomes with payment within window', () => {
    const actions = [
      { id: 'a1', action_type: 'reminder', status: 'completed', scheduled_at: day(-2), completed_at: day(-2), invoice_ids: ['i1'] },
    ]
    const events = [
      { action_id: 'a1', event_type: 'sent', to_status: null, created_at: day(-2) },
      { action_id: 'a1', event_type: 'delivered', to_status: null, created_at: day(-2) },
      { action_id: 'a1', event_type: 'read', to_status: null, created_at: day(-1) },
    ]
    const paymentEvents = [{ action_id: 'a1', created_at: day(0), amount: 1000 }] // 2 days after
    const out = computeOutcomeAnalytics({ actions, events, paymentEvents, promises: [], windowDays: 7 })
    expect(out.reminders.sent).toBe(1)
    expect(out.reminders.paid).toBe(1)
    expect(out.reminders.recoveryRate).toBe(100)
    expect(out.reminders.avgDaysToPayment).toBe(2)
    expect(out.whatsapp.readRate).toBe(100)
  })

  it('counts ignored reminders when no payment or promise', () => {
    const actions = [{ id: 'a2', action_type: 'reminder', status: 'completed', scheduled_at: day(-5), completed_at: day(-5), invoice_ids: ['i2'] }]
    const events = [{ action_id: 'a2', event_type: 'delivered', to_status: null, created_at: day(-5) }]
    const out = computeOutcomeAnalytics({ actions, events, paymentEvents: [], promises: [], windowDays: 7 })
    expect(out.reminders.sent).toBe(1)
    expect(out.reminders.paid).toBe(0)
    expect(out.reminders.ignored).toBe(1)
    expect(out.reminders.recoveryRate).toBe(0)
  })

  it('excludes payments outside the window', () => {
    const actions = [{ id: 'a3', action_type: 'call', status: 'completed', scheduled_at: day(-20), completed_at: day(-20), invoice_ids: [] }]
    const out = computeOutcomeAnalytics({
      actions, events: [], paymentEvents: [{ action_id: 'a3', created_at: day(0) }], promises: [], windowDays: 7,
    })
    expect(out.phoneCalls.sent).toBe(1)
    expect(out.phoneCalls.paid).toBe(0) // payment 20d later, outside 7d window
  })

  it('computes promise kept/broken rates', () => {
    const promises = [
      { status: 'kept', promise_date: day(-5), created_at: day(-6), paid_at: day(-3) },
      { status: 'broken', promise_date: day(-5), created_at: day(-6), paid_at: day(0) }, // 5 days late
    ]
    const out = computeOutcomeAnalytics({ actions: [], events: [], paymentEvents: [], promises, windowDays: 7 })
    expect(out.promises.total).toBe(2)
    expect(out.promises.kept).toBe(1)
    expect(out.promises.broken).toBe(1)
    expect(out.promises.keptRate).toBe(50)
    expect(out.promises.avgDaysLate).toBe(5)
  })

  it('computes phone call recovery rate', () => {
    const actions = [
      { id: 'c1', action_type: 'call', status: 'completed', scheduled_at: day(-1), completed_at: day(-1), invoice_ids: [] },
      { id: 'c2', action_type: 'call', status: 'completed', scheduled_at: day(-3), completed_at: day(-3), invoice_ids: [] },
    ]
    const out = computeOutcomeAnalytics({
      actions, events: [], paymentEvents: [{ action_id: 'c1', created_at: day(0) }], promises: [], windowDays: 7,
    })
    expect(out.phoneCalls.sent).toBe(2)
    expect(out.phoneCalls.paid).toBe(1)
    expect(out.phoneCalls.recoveryRate).toBe(50)
  })
})
