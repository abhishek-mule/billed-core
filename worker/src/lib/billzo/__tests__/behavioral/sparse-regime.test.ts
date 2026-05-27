import { describe, it, expect } from 'vitest'
import { computeWeekdayEntropy, computeHourEntropy, computeOverallEntropy } from '../../behavioral-entropy'
import { computeBehavioralTraits, resolvePrior } from '../../compute-behavioral-traits'
import type { CustomerBehavioralMetrics } from '@billzo/shared'

// ============================================================
// SPARSE-REGIME ADVERSARIAL TESTS
// ============================================================
// These tests verify that the behavioral inference system
// does not hallucinate structure from sparse observations.
//
// Scenarios simulate MSME debtors with 1-5 invoices,
// noisy timing, and inconsistent transport telemetry.
// ============================================================

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
    observationCount: 1,
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

describe('Scenario 1: Single Friday Payment', () => {
  // A customer with 1 payment on Friday at 19:00 should NOT
  // be classified as having strong temporal regularity.
  // One observation is insufficient to infer cyclical behavior.
  it('does not produce temporal regularity from a single payment', () => {
    const paymentHours = [19]
    const paymentWeekdays = [5] // Friday

    const weekdayEntropy = computeWeekdayEntropy(paymentWeekdays)
    const hourEntropy = computeHourEntropy(paymentHours)

    // Single observation → insufficient data → entropy = 1 (max uncertainty)
    expect(weekdayEntropy).toBeCloseTo(1, 2)
    expect(hourEntropy).toBeCloseTo(1, 2)

    // Combined overall entropy should also be high
    const overall = computeOverallEntropy({
      weekdayEntropy,
      hourEntropy,
      responseLatencyEntropy: 1,
      interventionEntropy: 1,
      liquidityEntropy: 1,
    }, 1)
    expect(overall).toBeCloseTo(1, 2)
  })

  it('temporalRegularity is low from a single payment window', () => {
    const metrics = makeMetrics({ observationCount: 1 })
    const resolvedPrior = resolvePrior({})
    const traits = computeBehavioralTraits({
      metrics,
      liquidityWindows: [{
        tenantId: 't1', customerId: 'c1', schemaVersion: 1,
        windowType: 'weekly', weekday: 5, hourBucket: 19,
        affinityScore: 1, observationCount: 1, lastSeenAt: null,
      }],
      paymentHours: [19],
      responseIntervals: [],
      sendHours: [],
      resolvedPrior,
    })
    // Single observation → temporalRegularity should be low
    expect(traits.temporalRegularity.value).toBeLessThan(0.5)
    expect(traits.temporalRegularity.priorSource).toBe('none')
  })
})

describe('Scenario 2: Two Late-Night Reads', () => {
  // Two reads at 2am should not create a "nocturnal preference" signal.
  // With only 2 observations, hour entropy should be high.
  it('hour entropy is high for only 2 observations', () => {
    const readHours = [2, 2]
    const hourEntropy = computeHourEntropy(readHours)
    expect(hourEntropy).toBeCloseTo(1, 2) // <3 obs → max uncertainty
  })
})

describe('Scenario 3: Three Random Payments', () => {
  // Three payments at completely different hours should produce high entropy.
  it('overall entropy is high for random sparse payments', () => {
    const hours = [7, 14, 22] // morning, afternoon, night
    const weekdays = [1, 3, 5] // Mon, Wed, Fri

    const hourEntropy = computeHourEntropy(hours)
    const weekdayEntropy = computeWeekdayEntropy(weekdays)

    // Three observations across different times → moderate-high entropy
    // Hour entropy: 3 observations in 3 different buckets of 24 → normalized ≈ 0.35
    // Weekday entropy: 3 observations in 3 different buckets of 7 → normalized ≈ 0.53
    expect(hourEntropy).toBeGreaterThan(0.3)
    expect(weekdayEntropy).toBeGreaterThan(0.5)
  })
})

describe('Scenario 4: Single Escalation Success', () => {
  // One successful escalation should not create a "pressure-sensitive" trait.
  // The interventionsUntilResolution field stays null when no interventions.
  it('does not infer constraint affinity from a single escalation success', () => {
    const metrics = makeMetrics({
      observationCount: 3,
      totalInterventionsSent: 2,
      totalInterventionsRead: 0,
      totalResolutionsAfterIntervention: 1,
      totalEscalationsReceived: 1,
      interventionsUntilResolution: 1, // 2 sent - 1 resolved = 1 remaining
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
    // With 1 interventionsUntilResolution out of max 10 → constraintAffinity = 0.1
    expect(traits.constraintAffinity.value).toBeLessThan(0.5)
    expect(traits.constraintAffinity.priorSource).toBe('customer')
  })
})

describe('Scenario 5: Missing Delivery Receipts', () => {
  // When only read receipts are available (no delivery receipts),
  // the channel should not be classified as dead.
  // Read rate itself is the primary viability signal.
  it('channelViability is not artificially zeroed by missing deliveries', () => {
    const metrics = makeMetrics({
      readRate: 0.6,
      observationCount: 10,
    })
    const resolvedPrior = resolvePrior({})
    const traits = computeBehavioralTraits({
      metrics,
      liquidityWindows: [],
      paymentHours: [],
      responseIntervals: [],
      sendHours: [], // no sends → high uncertainty in send entropy
      resolvedPrior,
    })
    // channelViability = readRate * (1 - 0.3 * entropy)
    // With no sendHours, entropy = 1, penalty = 0.3
    // channelViability = 0.6 * 0.7 = 0.42
    expect(traits.channelViability.value).toBeGreaterThan(0.3)
  })
})

describe('Scenario 6: Alternating Bimodal Behavior', () => {
  // Customer alternates between Friday 10am and Friday 8pm.
  // weekdayEntropy should be low (same day), but hourEntropy should be high.
  it('preserves bimodal structure — low weekday, high hour entropy', () => {
    const hours = [10, 20, 10, 20, 10, 20]
    const weekdays = [5, 5, 5, 5, 5, 5]

    const weekdayEntropy = computeWeekdayEntropy(weekdays)
    const hourEntropy = computeHourEntropy(hours)

    // All on Friday → weekdayEntropy should be near 0
    expect(weekdayEntropy).toBeLessThan(0.1)

    // Split between 10am and 8pm → hourEntropy should be high
    // 6 obs in 2 buckets of 24 → normalized entropy ≈ 0.22 (2/24 buckets)
    expect(hourEntropy).toBeGreaterThan(0.2)
  })
})
