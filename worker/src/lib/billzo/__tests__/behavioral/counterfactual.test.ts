import { describe, it, expect } from 'vitest'
import { assignToExperiment, computeBaseRate, computeAttributionLift } from '../../counterfactual'
import type { CohortDefinition, PredictionOutcome } from '@billzo/shared'

function makeCohort(overrides: Partial<CohortDefinition> = {}): CohortDefinition {
  return {
    id: 'cohort-1',
    tenantId: 't1',
    name: 'test-cohort',
    assignmentStrategy: 'random',
    controlFraction: 0.3,
    startDate: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function makePair(overrides: Partial<PredictionOutcome> = {}): PredictionOutcome {
  return {
    predicted: 0.5,
    actual: 1,
    metric: 'payment_conversion',
    observationCount: 10,
    ...overrides,
  }
}

describe('assignToExperiment', () => {
  it('returns null for empty cohorts', () => {
    const result = assignToExperiment('c1', 't1', [])
    expect(result).toBeNull()
  })

  it('returns an assignment for a single cohort', () => {
    const cohort = makeCohort()
    const result = assignToExperiment('c1', 't1', [cohort])
    expect(result).not.toBeNull()
    expect(result!.tenantId).toBe('t1')
    expect(result!.customerId).toBe('c1')
    expect(result!.cohortId).toBe('cohort-1')
    expect(['intervention', 'control', 'delayed']).toContain(result!.treatment)
  })

  it('same customer always gets same assignment (deterministic hash)', () => {
    const cohort = makeCohort()
    const r1 = assignToExperiment('c1', 't1', [cohort])
    const r2 = assignToExperiment('c1', 't1', [cohort])
    expect(r1!.treatment).toBe(r2!.treatment)
    expect(r1!.assignmentFactor).toBe(r2!.assignmentFactor)
  })

  it('different customers can get different treatments', () => {
    const cohort = makeCohort({ controlFraction: 0.5 })
    const results = new Set<string>()
    for (let i = 0; i < 100; i++) {
      const r = assignToExperiment(`c${i}`, 't1', [cohort])
      results.add(r!.treatment)
    }
    // With 100 customers and 0.5 fraction, likely both intervention and control appear
    expect(results.size).toBeGreaterThan(1)
  })

  it('mutual exclusion: customer assigned to at most one cohort', () => {
    const cohorts = [
      makeCohort({ id: 'cohort-a', controlFraction: 0.3 }),
      makeCohort({ id: 'cohort-b', controlFraction: 0.3 }),
    ]
    const result = assignToExperiment('c1', 't1', cohorts)
    expect(result).not.toBeNull()
    expect(['cohort-a', 'cohort-b']).toContain(result!.cohortId)
  })
})

describe('computeBaseRate', () => {
  it('returns null for fewer than 5 pairs', () => {
    const pairs = [makePair()]
    expect(computeBaseRate(pairs)).toBeNull()
  })

  it('returns null for empty pairs', () => {
    expect(computeBaseRate([])).toBeNull()
  })

  it('computes base rate correctly', () => {
    const pairs = Array.from({ length: 10 }, (_, i) => makePair({
      actual: i < 3 ? 1 : 0,
    }))
    const result = computeBaseRate(pairs)
    expect(result).not.toBeNull()
    expect(result!.baseRate).toBeCloseTo(0.3, 2)
    expect(result!.sampleSize).toBe(10)
    expect(result!.metric).toBe('payment_conversion')
  })

  it('confidence increases with sample size', () => {
    const small = computeBaseRate(Array.from({ length: 5 }, () => makePair({ actual: 1 })))
    const large = computeBaseRate(Array.from({ length: 100 }, () => makePair({ actual: 1 })))
    expect(small!.confidence).toBeLessThan(large!.confidence)
  })
})

describe('computeAttributionLift', () => {
  it('returns null when control has fewer than 5 pairs', () => {
    const treatment = Array.from({ length: 10 }, () => makePair({ actual: 1 }))
    const control = Array.from({ length: 2 }, () => makePair({ actual: 0 }))
    expect(computeAttributionLift(treatment, control)).toBeNull()
  })

  it('returns null when treatment has fewer than 5 pairs', () => {
    const treatment = Array.from({ length: 2 }, () => makePair({ actual: 1 }))
    const control = Array.from({ length: 10 }, () => makePair({ actual: 0 }))
    expect(computeAttributionLift(treatment, control)).toBeNull()
  })

  it('returns ~0 when treatment and control have same rate', () => {
    const pairs = Array.from({ length: 20 }, () => makePair({ actual: 1 }))
    const lift = computeAttributionLift(pairs.slice(0, 10), pairs.slice(10, 20))
    // Both have actual rate = 1.0, so lift = (1-1)/1 = 0
    expect(lift).toBeCloseTo(0, 5)
  })

  it('returns 1.0 when treatment rate is double control rate', () => {
    const treatment = Array.from({ length: 10 }, () => makePair({ actual: 1 }))
    const control = Array.from({ length: 10 }, () => makePair({ actual: 0, predicted: 0.5 }))
    // 8/10 = 0.8 treatment, 4/10 = 0.4 control → lift = (0.8-0.4)/0.4 = 1.0
    const treatmentHalf = treatment.map((p, i) => ({ ...p, actual: (i < 8 ? 1 : 0) as 0 | 1 }))
    const controlHalf = control.map((p, i) => ({ ...p, actual: (i < 4 ? 1 : 0) as 0 | 1 }))
    const lift = computeAttributionLift(treatmentHalf, controlHalf)
    expect(lift).toBeCloseTo(1.0, 2)
  })

  it('returns Infinity when control rate is 0 but treatment rate > 0', () => {
    const treatment = Array.from({ length: 10 }, () => makePair({ actual: 1 }))
    const control = Array.from({ length: 10 }, () => makePair({ actual: 0 }))
    const lift = computeAttributionLift(treatment, control)
    expect(lift).toBe(Infinity)
  })
})
