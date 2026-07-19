import { describe, it, expect } from 'vitest'
import { extractBehaviorProfile, getBehaviorProfile, type BehaviorSignals } from '@/lib/recovery/behavioral-engine'

const base: BehaviorSignals = {
  payments: [],
  remindersBeforeEachPayment: [],
  promises: [],
  actionOutcomes: [],
  messageReadLatenciesHours: [],
}

describe('behavioral-engine contract', () => {
  it('extracts a call-preferring profile from factual signals', () => {
    const s: BehaviorSignals = {
      ...base,
      payments: [
        { dueDate: '2025-07-01', paidDate: '2025-07-05', channel: 'call' },
        { dueDate: '2025-06-01', paidDate: '2025-06-08', channel: 'call' },
      ],
      remindersBeforeEachPayment: [2, 2],
      promises: [
        { status: 'kept', promiseDate: '2025-07-01', paidAt: '2025-07-05' },
        { status: 'broken', promiseDate: '2025-06-01', paidAt: null },
      ],
      actionOutcomes: [
        { channel: 'call', ledToPayment: true },
        { channel: 'call', ledToPayment: true },
        { channel: 'reminder', ledToPayment: false },
      ],
      messageReadLatenciesHours: [3, 5],
      preferredTimeBucket: 'evening',
      merchantMemoryHints: ['Do not call before 11AM'],
    }
    const p = extractBehaviorProfile('cu1', s)
    expect(p.averagePaymentDelay).toBe(5.5)
    expect(p.remindersBeforePayment).toBe(2)
    expect(p.promiseKeepRate).toBe(0.5)
    expect(p.preferredChannel).toBe('call')
    expect(p.prefersCalls).toBe(true)
    expect(p.responseLatencyHours).toBe(4)
    expect(p.paymentPattern).toMatch(/Usually pays after 2 reminders/)
    expect(p.paymentPattern).toMatch(/Keeps 50% of promises/)
    expect(p.paymentPattern).toMatch(/Do not call before 11AM/)
    expect(p.observations).toBeGreaterThan(0)
  })

  it('returns unknown when there is no data', () => {
    const p = extractBehaviorProfile('cuX', base)
    expect(p.preferredChannel).toBe('unknown')
    expect(p.promiseKeepRate).toBeNull()
    expect(p.paymentPattern).toBe('Not enough history yet.')
    expect(p.observations).toBe(0)
  })

  it('stub returns null until production data exists', async () => {
    expect(await getBehaviorProfile('cu1')).toBeNull()
  })
})
