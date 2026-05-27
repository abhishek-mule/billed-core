import { describe, it, expect } from 'vitest'
import {
  shannonEntropy,
  normalizedEntropy,
  computeLiquidityEntropy,
  computePaymentTimeEntropy,
  computeResponseEntropy,
  computeOverallEntropy,
  entropyToConfidence,
  computeWeekdayEntropy,
  computeHourEntropy,
  computeInterventionEntropy,
  computeResponseLatencyEntropy,
} from '../../behavioral-entropy'
import type { CustomerLiquidityWindow } from '@billzo/shared'

function makeEntropyComponents(overrides: Partial<{
  weekdayEntropy: number
  hourEntropy: number
  responseLatencyEntropy: number
  interventionEntropy: number
  liquidityEntropy: number
}> = {}) {
  return {
    weekdayEntropy: overrides.weekdayEntropy ?? 0.5,
    hourEntropy: overrides.hourEntropy ?? 0.5,
    responseLatencyEntropy: overrides.responseLatencyEntropy ?? 0.5,
    interventionEntropy: overrides.interventionEntropy ?? 0.5,
    liquidityEntropy: overrides.liquidityEntropy ?? 0.5,
  }
}

describe('shannonEntropy', () => {
  it('returns 0 for a single non-zero probability', () => {
    expect(shannonEntropy([10])).toBeCloseTo(0, 4)
  })

  it('returns 0 for all zeros', () => {
    expect(shannonEntropy([0, 0, 0])).toBeCloseTo(0, 4)
  })

  it('returns higher entropy for uniform distribution', () => {
    const low = shannonEntropy([100, 1, 1])
    const high = shannonEntropy([34, 33, 33])
    expect(high).toBeGreaterThan(low)
  })

  it('returns 0 for empty array', () => {
    expect(shannonEntropy([])).toBeCloseTo(0, 4)
  })

  it('handles negative values (treated as 0)', () => {
    const result = shannonEntropy([-1, 5])
    expect(result).toBeGreaterThanOrEqual(0)
  })
})

describe('normalizedEntropy', () => {
  it('returns 0 for 0 entropy', () => {
    expect(normalizedEntropy(0, 5)).toBeCloseTo(0, 4)
  })

  it('returns 1 for max entropy', () => {
    const maxEntropy = Math.log2(8)
    expect(normalizedEntropy(maxEntropy, 8)).toBeCloseTo(1, 4)
  })

  it('returns 0 for single bucket', () => {
    expect(normalizedEntropy(0.5, 1)).toBeCloseTo(0, 4)
  })
})

describe('computeLiquidityEntropy', () => {
  it('returns 1 for empty windows (max uncertainty)', () => {
    expect(computeLiquidityEntropy([])).toBeCloseTo(1, 2)
  })

  it('returns low entropy when all score is in one window', () => {
    const windows: CustomerLiquidityWindow[] = [
      { tenantId: 't', customerId: 'c', schemaVersion: 1, windowType: 'weekly', weekday: 5, hourBucket: 19, affinityScore: 50, observationCount: 50, lastSeenAt: null },
      { tenantId: 't', customerId: 'c', schemaVersion: 1, windowType: 'weekly', weekday: 0, hourBucket: 10, affinityScore: 1, observationCount: 1, lastSeenAt: null },
    ]
    const entropy = computeLiquidityEntropy(windows)
    expect(entropy).toBeLessThan(0.5)
  })

  it('returns high entropy when scores are spread evenly', () => {
    const windows: CustomerLiquidityWindow[] = Array.from({ length: 8 }, (_, i) => ({
      tenantId: 't', customerId: 'c', schemaVersion: 1, windowType: 'weekly',
      weekday: i % 7, hourBucket: i, affinityScore: 5, observationCount: 5, lastSeenAt: null,
    }))
    const entropy = computeLiquidityEntropy(windows)
    expect(entropy).toBeGreaterThan(0.8)
  })
})

describe('computePaymentTimeEntropy', () => {
  it('returns 1 for insufficient data (<3 observations)', () => {
    expect(computePaymentTimeEntropy([14])).toBeCloseTo(1, 2)
    expect(computePaymentTimeEntropy([14, 15])).toBeCloseTo(1, 2)
  })

  it('returns low entropy when payments cluster in few hours', () => {
    const hours = [19, 19, 20, 19, 20, 21, 19, 20, 19, 20]
    const entropy = computePaymentTimeEntropy(hours)
    expect(entropy).toBeLessThan(0.5)
  })

  it('returns high entropy when payments spread across many hours', () => {
    const hours = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]
    const entropy = computePaymentTimeEntropy(hours)
    expect(entropy).toBeGreaterThan(0.85)
  })

  it('ignores out-of-range hours', () => {
    const hours = [19, 19, 20, -1, 25]
    const entropy = computePaymentTimeEntropy(hours)
    expect(entropy).toBeGreaterThan(0)
    expect(entropy).toBeLessThanOrEqual(1)
  })
})

describe('computeResponseEntropy', () => {
  it('returns 1 for insufficient data (<2 intervals)', () => {
    expect(computeResponseEntropy([5])).toBeCloseTo(1, 2)
  })

  it('returns low entropy when responses are consistent', () => {
    const intervals = [2, 3, 2, 3, 2, 3] // always respond within 1-4h
    const entropy = computeResponseEntropy(intervals)
    expect(entropy).toBeLessThan(0.6)
  })

  it('returns high entropy when responses are erratic', () => {
    const intervals = [0.5, 48, 1, 96, 0.2, 72] // wildly varying
    const entropy = computeResponseEntropy(intervals)
    // Buckets: 0-1h=[0.5,0.2], 1-4h=[1], 4-12h=[], 12-24h=[], 24-72h=[48], 72h+=[96,72]
    // Normalized entropy is ~0.56 — still high but not extreme
    expect(entropy).toBeGreaterThan(0.5)
  })
})

describe('computeWeekdayEntropy', () => {
  it('returns 1 for insufficient data (<3 observations)', () => {
    expect(computeWeekdayEntropy([0, 1])).toBeCloseTo(1, 2)
  })

  it('returns 0 when all payments on same weekday', () => {
    const entropy = computeWeekdayEntropy([5, 5, 5, 5, 5])
    expect(entropy).toBeCloseTo(0, 2)
  })

  it('returns high entropy when payments spread across all weekdays', () => {
    const entropy = computeWeekdayEntropy([0, 1, 2, 3, 4, 5, 6])
    expect(entropy).toBeGreaterThan(0.8)
  })
})

describe('computeHourEntropy', () => {
  it('returns 1 for insufficient data (<3 observations)', () => {
    expect(computeHourEntropy([10, 11])).toBeCloseTo(1, 2)
  })

  it('delegates to computePaymentTimeEntropy (same computation)', () => {
    const hours = [9, 9, 9, 10, 10, 10, 11, 11]
    expect(computeHourEntropy(hours)).toBe(computePaymentTimeEntropy(hours))
  })
})

describe('computeInterventionEntropy', () => {
  it('returns 1 for insufficient data (<3 observations)', () => {
    expect(computeInterventionEntropy([10, 14])).toBeCloseTo(1, 2)
  })

  it('returns 0 when all sends at same hour', () => {
    const entropy = computeInterventionEntropy([14, 14, 14])
    expect(entropy).toBeCloseTo(0, 2)
  })
})

describe('computeResponseLatencyEntropy', () => {
  it('returns 1 for insufficient data (<2 intervals)', () => {
    expect(computeResponseLatencyEntropy([5])).toBeCloseTo(1, 2)
  })

  it('delegates to computeResponseEntropy (same computation)', () => {
    const intervals = [2, 3, 2, 3, 2, 3]
    expect(computeResponseLatencyEntropy(intervals)).toBe(computeResponseEntropy(intervals))
  })
})

describe('computeOverallEntropy', () => {
  it('returns 1 for insufficient observations (<5)', () => {
    expect(computeOverallEntropy(makeEntropyComponents({}), 3)).toBeCloseTo(1, 2)
  })

  it('returns lower value for structured behavior', () => {
    const entropy = computeOverallEntropy(makeEntropyComponents({
      weekdayEntropy: 0.2,
      hourEntropy: 0.3,
      responseLatencyEntropy: 0.3,
      liquidityEntropy: 0.1,
    }), 50)
    expect(entropy).toBeLessThan(0.5)
  })

  it('returns higher value for chaotic behavior', () => {
    const entropy = computeOverallEntropy(makeEntropyComponents({
      weekdayEntropy: 0.9,
      hourEntropy: 0.8,
      responseLatencyEntropy: 0.8,
      liquidityEntropy: 0.7,
    }), 50)
    expect(entropy).toBeGreaterThan(0.7)
  })

  it('clamps output to [0, 1]', () => {
    const entropy = computeOverallEntropy(makeEntropyComponents({
      weekdayEntropy: 2,
      hourEntropy: 2,
      responseLatencyEntropy: 2,
      liquidityEntropy: 2,
    }), 50)
    expect(entropy).toBeLessThanOrEqual(1)
    expect(entropy).toBeGreaterThanOrEqual(0)
  })
})

describe('entropyToConfidence', () => {
  it('returns 1 for 0 entropy', () => {
    expect(entropyToConfidence(0)).toBeCloseTo(1, 4)
  })

  it('returns 0 for entropy of 1', () => {
    expect(entropyToConfidence(1)).toBeCloseTo(0, 4)
  })

  it('returns 0.5 for entropy of 0.5', () => {
    expect(entropyToConfidence(0.5)).toBeCloseTo(0.5, 4)
  })
})
