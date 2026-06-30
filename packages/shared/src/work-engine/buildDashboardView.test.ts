import { describe, it, expect } from 'vitest'
import { buildDashboardView } from './buildDashboardView'
import type { WorkItem, Action } from './types'

describe('buildDashboardView', () => {
  it('passes through work, cash, and activity unchanged', () => {
    const primaryAction: Action = {
      type: 'receive_payment',
      label: 'Receive Payment',
      target: { entity: 'payment', id: 'p1' },
    }
    const work: WorkItem[] = [{
      id: 'w1',
      customerId: 'c1',
      customerName: 'A',
      headline: 'Test',
      reason: 'Test reason',
      severity: 'normal',
      primaryAction,
      moneyImpact: 100,
    }]
    const input = {
      work,
      cash: { outstanding: 100, collectedToday: 50, expectedToday: 100, customerCount: 1 },
      activity: [{ occurredAt: '2026-06-30T10:00:00Z', label: 'Payment', detail: '₹5,000' }],
    }

    const result = buildDashboardView(input)

    expect(result.work).toBe(input.work)
    expect(result.cash).toBe(input.cash)
    expect(result.activity).toBe(input.activity)
  })
})