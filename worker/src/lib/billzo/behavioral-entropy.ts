import type { CustomerLiquidityWindow } from '@billzo/shared'

// ============================================================
// BEHAVIORAL ENTROPY — Uncertainty measurement
// ============================================================
// Measures how predictable a customer's behavior is.
// High entropy = chaotic/unstructured behavior → orchestration confidence should be low.
// Low entropy = structured/predictable behavior → orchestration can rely on patterns.
//
// This prevents the system from hallucinating patterns in sparse random data.
// ============================================================

export interface BehavioralEntropy {
  paymentTimeEntropy: number
  responseEntropy: number
  liquidityEntropy: number
  weekdayEntropy: number
  hourEntropy: number
  interventionEntropy: number
  responseLatencyEntropy: number
  overallEntropy: number
}

/**
 * Compute entropy from a discrete probability distribution.
 * H(X) = -Σ p(x) * log2(p(x))
 * Range: 0 (perfectly predictable) to log2(n) (uniform/max uncertainty)
 */
export function shannonEntropy(probabilities: number[]): number {
  const clamped = probabilities.map(p => Math.max(0, p))
  const total = clamped.reduce((s, p) => s + p, 0)
  if (total === 0) return 0

  return -clamped.reduce((sum, p) => {
    if (p <= 0) return sum
    const norm = p / total
    return sum + norm * Math.log2(norm)
  }, 0)
}

/**
 * Normalize entropy to [0, 1] range where:
 *   0 = perfectly predictable (all mass in one bucket)
 *   1 = maximally uncertain (uniform across all buckets)
 */
export function normalizedEntropy(entropy: number, bucketCount: number): number {
  if (bucketCount <= 1) return 0
  const maxEntropy = Math.log2(bucketCount)
  if (maxEntropy === 0) return 0
  return entropy / maxEntropy
}

/**
 * Compute entropy from liquidity windows.
 * Low entropy = payments cluster in few time buckets (strong preference)
 * High entropy = payments spread across many buckets (weak/no preference)
 */
export function computeLiquidityEntropy(
  windows: CustomerLiquidityWindow[],
): number {
  if (windows.length === 0) return 1 // maximum uncertainty

  const scores = windows.map(w => w.affinityScore)
  const rawEntropy = shannonEntropy(scores)
  return normalizedEntropy(rawEntropy, scores.length)
}

/**
 * Compute payment timing entropy from a list of payment hour-of-day
 * observations. Low entropy = payments reliably happen at certain hours.
 */
export function computePaymentTimeEntropy(
  paymentHours: number[],
): number {
  if (paymentHours.length < 3) return 1 // insufficient data → max uncertainty

  const buckets = new Array(24).fill(0)
  for (const h of paymentHours) {
    if (h >= 0 && h < 24) buckets[h]++
  }

  const rawEntropy = shannonEntropy(buckets)
  return normalizedEntropy(rawEntropy, 24)
}

/**
 * Compute weekday entropy from payment day-of-week observations.
 * 7 buckets (Sunday=0, Saturday=6).
 * Low entropy = payments cluster on specific weekdays.
 */
export function computeWeekdayEntropy(paymentWeekdays: number[]): number {
  if (paymentWeekdays.length < 3) return 1

  const buckets = new Array(7).fill(0)
  for (const d of paymentWeekdays) {
    if (d >= 0 && d < 7) buckets[d]++
  }

  const rawEntropy = shannonEntropy(buckets)
  return normalizedEntropy(rawEntropy, 7)
}

/**
 * Compute hour entropy from payment hour-of-day observations.
 * 24 buckets. Low entropy = payments cluster at specific hours.
 * This is the same computation as computePaymentTimeEntropy but
 * exposed as a named dimension for decomposed entropy reporting.
 */
export function computeHourEntropy(paymentHours: number[]): number {
  return computePaymentTimeEntropy(paymentHours)
}

/**
 * Compute intervention entropy from send hour-of-day observations.
 * 24 buckets. Low entropy = interventions cluster at specific hours.
 * High entropy = sends are spread across the day.
 */
export function computeInterventionEntropy(sendHours: number[]): number {
  if (sendHours.length < 3) return 1

  const buckets = new Array(24).fill(0)
  for (const h of sendHours) {
    if (h >= 0 && h < 24) buckets[h]++
  }

  const rawEntropy = shannonEntropy(buckets)
  return normalizedEntropy(rawEntropy, 24)
}

/**
 * Compute response latency entropy from inter-event intervals (hours).
 * 6 buckets. Low entropy = debtor responds with consistent timing.
 * Same computation as computeResponseEntropy — alias for dimensional clarity.
 */
export function computeResponseLatencyEntropy(intervals: number[]): number {
  return computeResponseEntropy(intervals)
}

/**
 * Compute response pattern entropy from inter-event intervals (hours).
 * Low entropy = debtor responds with consistent timing.
 * High entropy = erratic/inconsistent response patterns.
 */
export function computeResponseEntropy(
  responseIntervalsHours: number[],
): number {
  if (responseIntervalsHours.length < 2) return 1

  // Discretize into buckets: 0-1h, 1-4h, 4-12h, 12-24h, 24-72h, 72h+
  const buckets = [0, 0, 0, 0, 0, 0]
  for (const interval of responseIntervalsHours) {
    if (interval <= 1) buckets[0]++
    else if (interval <= 4) buckets[1]++
    else if (interval <= 12) buckets[2]++
    else if (interval <= 24) buckets[3]++
    else if (interval <= 72) buckets[4]++
    else buckets[5]++
  }

  const rawEntropy = shannonEntropy(buckets)
  return normalizedEntropy(rawEntropy, buckets.length)
}

/**
 * Compute overall behavioral entropy as a weighted combination
 * of dimensional entropy scores.
 *
 * Current weights assume approximate independence between dimensions.
 * Future versions may move toward conditional/joint distributions
 * as the trait model evolves.
 */
export function computeOverallEntropy(components: {
  weekdayEntropy: number
  hourEntropy: number
  responseLatencyEntropy: number
  interventionEntropy: number
  liquidityEntropy: number
}, observationCount: number): number {
  if (observationCount < 5) return 1

  const weights = {
    weekday: 0.20,
    hour: 0.25,
    responseLatency: 0.25,
    intervention: 0.15,
    liquidity: 0.15,
  }

  const weighted =
    components.weekdayEntropy * weights.weekday +
    components.hourEntropy * weights.hour +
    components.responseLatencyEntropy * weights.responseLatency +
    components.interventionEntropy * weights.intervention +
    components.liquidityEntropy * weights.liquidity

  return Math.min(1, Math.max(0, weighted))
}

/**
 * Derive orchestration confidence from entropy.
 * High entropy → low confidence (engine should be conservative).
 * Low entropy → high confidence (engine can be assertive).
 */
export function entropyToConfidence(overallEntropy: number): number {
  return 1 - overallEntropy
}
