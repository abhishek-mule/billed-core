import type {
  CustomerBehavioralMetrics,
  CustomerLiquidityWindow,
  TemporalPrior,
  ResolvedPrior,
  BehavioralTraits,
} from '@billzo/shared'
import { computeLiquidityEntropy, normalizedEntropy, shannonEntropy, entropyToConfidence } from './behavioral-entropy'
import { computeConfidence } from './decay'

export const TRAITS_VERSION = '1.0.0'

// ============================================================
// BAYESIAN PRIOR RESOLUTION
// ============================================================
// Hierarchical fallback: segment → tenant → global → none.
// Never synthesizes a distribution. null = honest uncertainty.
// ============================================================

const DEFAULT_PRIOR_STRENGTH = 10

export function resolvePrior(ctx: {
  segment?: Partial<TemporalPrior>
  tenant?: Partial<TemporalPrior>
  global?: Partial<TemporalPrior>
}): ResolvedPrior {
  if (ctx.segment) return { source: 'segment', prior: normalizePartialPrior(ctx.segment) }
  if (ctx.tenant) return { source: 'tenant', prior: normalizePartialPrior(ctx.tenant) }
  if (ctx.global) return { source: 'global', prior: normalizePartialPrior(ctx.global) }
  return { source: 'none', prior: null }
}

function normalizePartialPrior(p: Partial<TemporalPrior>): TemporalPrior {
  // NOT equivalent to raw observation count.
  // effectiveWeight represents trust-adjusted contribution mass
  // after decay and confidence weighting. Raw observation count
  // is semantically different and should not be substituted.
  return {
    weekdayDistribution: p.weekdayDistribution ?? [],
    hourDistribution: p.hourDistribution ?? [],
    interventionLatencyDistribution: p.interventionLatencyDistribution ?? [],
    observationCount: p.observationCount ?? 0,
    effectiveWeight: p.effectiveWeight ?? p.observationCount ?? 0,
  }
}

// ============================================================
// BAYESIAN POSTERIOR AFFINITY
// ============================================================
// Blends raw customer affinity with prior distribution per bucket.
//
// posterior[i] = (priorStrength * priorDist[i] + raw[i]) / (priorStrength + totalRaw)
//
// Low observations → prior dominates
// High observations → customer signal dominates
// No prior → raw affinity normalized

export function computePosteriorAffinity(params: {
  customerWindows: CustomerLiquidityWindow[]
  prior?: TemporalPrior | null
  priorStrength?: number
}): {
  weekdayAffinities: number[]
  hourAffinities: number[]
  priorSource: 'customer' | 'none'
} {
  const { customerWindows, prior, priorStrength = DEFAULT_PRIOR_STRENGTH } = params
  const priorSource = prior ? 'customer' : 'none'

  if (customerWindows.length === 0) {
    // No customer data — return prior if available
    if (prior) {
      return {
        weekdayAffinities: [...prior.weekdayDistribution],
        hourAffinities: [...prior.hourDistribution],
        priorSource: 'customer',
      }
    }
    // No data, no prior — uniform uncertainty
    return {
      weekdayAffinities: [],
      hourAffinities: [],
      priorSource: 'none',
    }
  }

  // Build raw affinity arrays per bucket
  const rawWeekday = new Array(7).fill(0)
  const rawHour = new Array(24).fill(0)

  for (const w of customerWindows) {
    if (w.weekday >= 0 && w.weekday < 7) {
      rawWeekday[w.weekday] += w.affinityScore
    }
    if (w.hourBucket >= 0 && w.hourBucket < 24) {
      rawHour[w.hourBucket] += w.affinityScore
    }
  }

  const totalRawWeekday = rawWeekday.reduce((s, v) => s + v, 0)
  const totalRawHour = rawHour.reduce((s, v) => s + v, 0)

  if (!prior) {
    // No prior — return raw affinities normalized
    const normedWeekday = totalRawWeekday > 0
      ? rawWeekday.map(v => v / totalRawWeekday)
      : rawWeekday
    const normedHour = totalRawHour > 0
      ? rawHour.map(v => v / totalRawHour)
      : rawHour
    return { weekdayAffinities: normedWeekday, hourAffinities: normedHour, priorSource: 'none' }
  }

  // Bayesian blend per bucket
  const priorWeekday = prior.weekdayDistribution.length === 7 ? prior.weekdayDistribution : new Array(7).fill(1 / 7)
  const priorHour = prior.hourDistribution.length === 24 ? prior.hourDistribution : new Array(24).fill(1 / 24)

  const blendedWeekday = rawWeekday.map((raw, i) => {
    return (priorStrength * priorWeekday[i] + raw) / (priorStrength + totalRawWeekday)
  })
  const blendedHour = rawHour.map((raw, i) => {
    return (priorStrength * priorHour[i] + raw) / (priorStrength + totalRawHour)
  })

  return {
    weekdayAffinities: blendedWeekday,
    hourAffinities: blendedHour,
    priorSource: 'customer',
  }
}

// ============================================================
// BEHAVIORAL TRAITS
// ============================================================

export function computeBehavioralTraits(params: {
  metrics: CustomerBehavioralMetrics
  liquidityWindows: CustomerLiquidityWindow[]
  paymentHours: number[]
  responseIntervals: number[]
  sendHours: number[]
  resolvedPrior: ResolvedPrior
}): BehavioralTraits {
  const { metrics, liquidityWindows, paymentHours, responseIntervals, sendHours, resolvedPrior } = params
  const { source: priorSource, prior } = resolvedPrior
  const obsCount = metrics.observationCount

  // Evidence weight: how many customer observations informed this trait
  // Capped at 100 to keep bounded; raw count is semantically different
  // from trust-adjusted weight
  const evidenceWeight = Math.min(obsCount, 100)

  // Compute posterior affinities
  const posterior = computePosteriorAffinity({
    customerWindows: liquidityWindows,
    prior: prior ?? undefined,
  })

  // Compute entropy of posterior distributions
  const weekdayEntropy = posterior.weekdayAffinities.length > 0
    ? normalizedEntropy(shannonEntropy(posterior.weekdayAffinities), 7)
    : 1
  const hourEntropy = posterior.hourAffinities.length > 0
    ? normalizedEntropy(shannonEntropy(posterior.hourAffinities), 24)
    : 1

  // temporalRegularity: inverse of combined entropy
  // Multiplied by observation density to prevent hallucinating
  // structure from sparse data. With 1 observation, even if
  // entropy is 0, regularity is near 0.
  // High when: many observations + clustered in specific times
  const OBS_DENSITY_SATURATION = 20
  const observationDensity = 1 - Math.exp(-obsCount / OBS_DENSITY_SATURATION)
  const temporalRegularityValue = obsCount > 0
    ? (1 - (weekdayEntropy * 0.4 + hourEntropy * 0.6)) * observationDensity
    : 0

  // constraintAffinity: how many interventions until resolution
  // High value = needs many reminders (threshold-driven behavior)
  const constraintValue = metrics.interventionsUntilResolution != null
    ? Math.min(metrics.interventionsUntilResolution / 10, 1)
    : (prior ? 0.3 : 0.5)

  // strategicDelayLikelihood: read-to-pay latency relative to expected
  // Fast = immediate (not strategic); Slow = intentional delay
  const delayValue = metrics.avgReadToPayHours > 0
    ? Math.min(metrics.avgReadToPayHours / 168, 1) // 168h = 1 week cap
    : 0.3

  // disputeRisk: escalation ratio
  const resolutions = metrics.totalResolutionsAfterIntervention
  const escalations = metrics.totalEscalationsReceived
  const disputeValue = resolutions > 0
    ? Math.min(escalations / resolutions, 1)
    : (escalations > 0 ? 0.5 : 0.1)

  // channelViability: read rate with entropy adjustment
  const channelEntropy = sendHours.length > 0
    ? normalizedEntropy(shannonEntropy(sendHours.map(h => Math.max(0, h))), 24)
    : 1
  const viabilityValue = metrics.readRate * (1 - channelEntropy * 0.3)

  return {
    temporalRegularity: {
      value: temporalRegularityValue,
      priorSource,
      evidenceWeight,
    },
    constraintAffinity: {
      value: constraintValue,
      priorSource: obsCount > 0 ? 'customer' : priorSource,
      evidenceWeight,
    },
    strategicDelayLikelihood: {
      value: delayValue,
      priorSource: obsCount > 0 ? 'customer' : priorSource,
      evidenceWeight,
    },
    disputeRisk: {
      value: disputeValue,
      priorSource: obsCount > 0 ? 'customer' : priorSource,
      evidenceWeight,
    },
    channelViability: {
      value: viabilityValue,
      priorSource: obsCount > 0 ? 'customer' : priorSource,
      evidenceWeight,
    },
  }
}
