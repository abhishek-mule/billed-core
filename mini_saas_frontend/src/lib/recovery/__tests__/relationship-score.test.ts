import { describe, it, expect } from 'vitest'
import { scoreRelationship, deriveTrend, stars } from '@/lib/recovery/relationship-score'

describe('relationship-score', () => {
  it('scores a trusted customer high', () => {
    const s = scoreRelationship({
      paidBeforeDue: 3, paidWithin7: 1, promisesKept: 2, remindersRead: 5, remindersSent: 6, observations: 10,
    })
    expect(s.score).toBeGreaterThanOrEqual(80)
    expect(s.stars).toBe(5)
    expect(s.label).toBe('Trusted')
    expect(s.reasons.join(' ')).toMatch(/before the due date/)
  })

  it('scores a broken-promise customer low', () => {
    const s = scoreRelationship({
      promisesBroken: 2, overdue30plus: 2, requiredCalls: 2, observations: 4,
    })
    expect(s.score).toBeLessThan(40)
    expect(s.stars).toBeLessThanOrEqual(2)
    expect(s.label).toBe('High Recovery Effort')
  })

  it('starts at average with no history', () => {
    const s = scoreRelationship({ observations: 0 })
    expect(s.score).toBe(40)
    expect(s.stars).toBe(3)
    expect(s.label).toBe('Average')
    expect(s.reasons[0]).toMatch(/Not enough history/)
  })

  it('derives trend from prior score', () => {
    expect(deriveTrend(null, 70)).toBe('new')
    expect(deriveTrend(60, 72)).toBe('improving')
    expect(deriveTrend(60, 48)).toBe('declining')
    expect(deriveTrend(60, 61)).toBe('stable')
  })

  it('stars renders correctly', () => {
    expect(stars(5)).toBe('★★★★★')
    expect(stars(1)).toBe('★☆☆☆☆')
  })
})
