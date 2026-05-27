import { describe, it, expect } from 'vitest'
import { resolvePrior, computePosteriorAffinity, computeBehavioralTraits } from '../../compute-behavioral-traits'
import type { CustomerBehavioralMetrics, CustomerLiquidityWindow, TemporalPrior } from '@billzo/shared'

function makeMetrics(overrides: Partial<CustomerBehavioralMetrics> = {}): CustomerBehavioralMetrics {
  return {
    tenantId: 't1',
    customerId: 'c1',
    schemaVersion: 1,
    readRate: 0.5,
    paymentConversionRate: 0.3,
    avgReadToPayHours: 24,
    avgReminderResponseHours: 12,
    avgSettlementLatencyHours: 48,
    observationCount: 0,
    totalInterventionsSent: 0,
    totalInterventionsRead: 0,
    totalResolutionsAfterIntervention: 0,
    totalEscalationsReceived: 0,
    lastEscalationAt: null,
    interventionsUntilResolution: null,
    lastResolutionAt: null,
    lastReadAt: null,
    lastResponseAt: null,
    lastEventAt: null,
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

function makeWindow(overrides: Partial<CustomerLiquidityWindow> = {}): CustomerLiquidityWindow {
  return {
    tenantId: 't1',
    customerId: 'c1',
    schemaVersion: 1,
    windowType: 'weekly',
    weekday: 5,
    hourBucket: 19,
    affinityScore: 1,
    observationCount: 1,
    lastSeenAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('resolvePrior', () => {
  it('returns source=none when no priors provided', () => {
    const result = resolvePrior({})
    expect(result.source).toBe('none')
    expect(result.prior).toBeNull()
  })

  it('returns source=segment when segment prior exists', () => {
    const result = resolvePrior({
      segment: { hourDistribution: [1], weekdayDistribution: [], interventionLatencyDistribution: [], observationCount: 5, effectiveWeight: 5 },
    })
    expect(result.source).toBe('segment')
    expect(result.prior).not.toBeNull()
  })

  it('returns source=tenant when only tenant prior exists', () => {
    const result = resolvePrior({
      tenant: { hourDistribution: [1], weekdayDistribution: [], interventionLatencyDistribution: [], observationCount: 3, effectiveWeight: 3 },
    })
    expect(result.source).toBe('tenant')
  })

  it('prefers segment over tenant (hierarchical fallback)', () => {
    const result = resolvePrior({
      segment: { hourDistribution: [1], weekdayDistribution: [], interventionLatencyDistribution: [], observationCount: 5, effectiveWeight: 5 },
      tenant: { hourDistribution: [1], weekdayDistribution: [], interventionLatencyDistribution: [], observationCount: 3, effectiveWeight: 3 },
    })
    expect(result.source).toBe('segment')
  })
})

describe('computePosteriorAffinity', () => {
  it('returns empty affinities for no windows and no prior', () => {
    const result = computePosteriorAffinity({ customerWindows: [] })
    expect(result.hourAffinities).toEqual([])
    expect(result.weekdayAffinities).toEqual([])
    expect(result.priorSource).toBe('none')
  })

  it('returns prior distributions when no customer windows but prior exists', () => {
    const prior: TemporalPrior = {
      weekdayDistribution: [0.1, 0.1, 0.1, 0.1, 0.1, 0.3, 0.2],
      hourDistribution: new Array(24).fill(1 / 24),
      interventionLatencyDistribution: [],
      observationCount: 50,
      effectiveWeight: 50,
    }
    const result = computePosteriorAffinity({ customerWindows: [], prior })
    expect(result.weekdayAffinities).toEqual(prior.weekdayDistribution)
    expect(result.priorSource).toBe('customer')
  })

  it('customer signal dominates with many observations', () => {
    const prior: TemporalPrior = {
      weekdayDistribution: [1, 0, 0, 0, 0, 0, 0], // all on Sunday
      hourDistribution: new Array(24).fill(1 / 24),
      interventionLatencyDistribution: [],
      observationCount: 1000,
      effectiveWeight: 1000,
    }
    // 100 windows all on Friday (weekday=5) at 19:00
    const windows = Array.from({ length: 100 }, () => makeWindow({ weekday: 5, hourBucket: 19, affinityScore: 1 }))
    const result = computePosteriorAffinity({ customerWindows: windows, prior, priorStrength: 10 })

    // With 100 observations and priorStrength=10, customer should dominate
    // Friday (index 5) should have the highest affinity
    const maxIdx = result.weekdayAffinities.indexOf(Math.max(...result.weekdayAffinities))
    expect(maxIdx).toBe(5)
  })

  it('prior dominates with few observations', () => {
    const prior: TemporalPrior = {
      weekdayDistribution: [1, 0, 0, 0, 0, 0, 0], // all on Sunday
      hourDistribution: new Array(24).fill(1 / 24),
      interventionLatencyDistribution: [],
      observationCount: 1000,
      effectiveWeight: 1000,
    }
    // Only 1 window on Friday
    const windows = [makeWindow({ weekday: 5, hourBucket: 19, affinityScore: 1 })]
    const result = computePosteriorAffinity({ customerWindows: windows, prior, priorStrength: 10 })

    // With priorStrength=10 and 1 observation, prior should dominate
    // Sunday (index 0) should have the highest blended affinity
    const maxIdx = result.weekdayAffinities.indexOf(Math.max(...result.weekdayAffinities))
    expect(maxIdx).toBe(0)
  })
})

describe('computeBehavioralTraits', () => {
  it('returns trait values with provenance for 0-observation customer', () => {
    const metrics = makeMetrics({ observationCount: 0 })
    const resolvedPrior = resolvePrior({})
    const traits = computeBehavioralTraits({
      metrics,
      liquidityWindows: [],
      paymentHours: [],
      responseIntervals: [],
      sendHours: [],
      resolvedPrior,
    })

    // All traits should have priorSource='none' and evidenceWeight=0
    expect(traits.temporalRegularity.priorSource).toBe('none')
    expect(traits.temporalRegularity.evidenceWeight).toBe(0)
    // temporalRegularity should be 0 when no observations
    expect(traits.temporalRegularity.value).toBe(0)
  })

  it('incorporates tenant prior when available', () => {
    const metrics = makeMetrics({ observationCount: 2 })
    const resolvedPrior = resolvePrior({
      tenant: {
        weekdayDistribution: [0.2, 0.1, 0.1, 0.1, 0.1, 0.3, 0.1],
        hourDistribution: new Array(24).fill(1 / 24),
        interventionLatencyDistribution: [],
        observationCount: 30,
        effectiveWeight: 30,
      },
    })
    const traits = computeBehavioralTraits({
      metrics,
      liquidityWindows: [],
      paymentHours: [],
      responseIntervals: [],
      sendHours: [],
      resolvedPrior,
    })

    // With 2 observations, priorSource should be 'tenant' for temporalRegularity
    // (no customer data), but 'customer' for traits that use metrics
    expect(traits.temporalRegularity.priorSource).toBe('tenant')
    expect(traits.temporalRegularity.evidenceWeight).toBe(2)
  })

  it('disputeRisk is low when no escalations exist', () => {
    const metrics = makeMetrics({
      observationCount: 10,
      totalResolutionsAfterIntervention: 5,
      totalEscalationsReceived: 0,
    })
    const resolvedPrior = resolvePrior({})
    const traits = computeBehavioralTraits({
      metrics,
      liquidityWindows: [],
      paymentHours: [],
      responseIntervals: [],
      sendHours: [],
      resolvedPrior,
    })
    expect(traits.disputeRisk.value).toBeLessThan(0.2)
  })

  it('disputeRisk increases with escalation ratio', () => {
    const metrics = makeMetrics({
      observationCount: 10,
      totalResolutionsAfterIntervention: 2,
      totalEscalationsReceived: 2,
    })
    const resolvedPrior = resolvePrior({})
    const traits = computeBehavioralTraits({
      metrics,
      liquidityWindows: [],
      paymentHours: [],
      responseIntervals: [],
      sendHours: [],
      resolvedPrior,
    })
    // 2/2 = 1.0 ratio, clamped to 1.0
    expect(traits.disputeRisk.value).toBe(1.0)
  })

  it('channelViability is derived from readRate', () => {
    const metrics = makeMetrics({ readRate: 0.8, observationCount: 20 })
    const resolvedPrior = resolvePrior({})
    const traits = computeBehavioralTraits({
      metrics,
      liquidityWindows: [],
      paymentHours: [],
      responseIntervals: [],
      sendHours: [10, 11, 14],
      resolvedPrior,
    })
    // readRate * (1 - entropyPenalty) = 0.8 * (1 - 0.3*sendEntropy)
    // 3 sends at different hours → high entropy → some penalty
    expect(traits.channelViability.value).toBeGreaterThan(0)
    expect(traits.channelViability.value).toBeLessThanOrEqual(0.8)
    expect(traits.channelViability.priorSource).toBe('customer')
  })
})
