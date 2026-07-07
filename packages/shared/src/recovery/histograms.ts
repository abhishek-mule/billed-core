import type { NormalizedRecoveryEvent } from './normalized-event'

export type ProbabilityDistribution = number[]

export interface MultiResolutionTemporal {
  hourOfDay: ProbabilityDistribution
  dayOfWeek: ProbabilityDistribution
  weekOfMonth: ProbabilityDistribution
  month: ProbabilityDistribution
}

function normalize(buckets: number[]): ProbabilityDistribution {
  const total = buckets.reduce((s, v) => s + v, 0)
  if (total === 0) return buckets.map(() => 0)
  return buckets.map(v => v / total)
}

export function extractHourOfDay(events: NormalizedRecoveryEvent[]): ProbabilityDistribution {
  const buckets = new Array(24).fill(0)
  for (const e of events) {
    const h = new Date(e.timestamp).getHours()
    if (h >= 0 && h < 24) buckets[h]++
  }
  return normalize(buckets)
}

export function extractDayOfWeek(events: NormalizedRecoveryEvent[]): ProbabilityDistribution {
  const buckets = new Array(7).fill(0)
  for (const e of events) {
    const d = new Date(e.timestamp).getDay()
    if (d >= 0 && d < 7) buckets[d]++
  }
  return normalize(buckets)
}

export function extractWeekOfMonth(events: NormalizedRecoveryEvent[]): ProbabilityDistribution {
  const buckets = new Array(5).fill(0)
  for (const e of events) {
    const dt = new Date(e.timestamp)
    const week = Math.floor((dt.getDate() - 1) / 7)
    if (week >= 0 && week < 5) buckets[week]++
  }
  return normalize(buckets)
}

export function extractMonth(events: NormalizedRecoveryEvent[]): ProbabilityDistribution {
  const buckets = new Array(12).fill(0)
  for (const e of events) {
    const m = new Date(e.timestamp).getMonth()
    if (m >= 0 && m < 12) buckets[m]++
  }
  return normalize(buckets)
}

export function buildMultiResolutionTemporal(events: NormalizedRecoveryEvent[]): MultiResolutionTemporal {
  return {
    hourOfDay: extractHourOfDay(events),
    dayOfWeek: extractDayOfWeek(events),
    weekOfMonth: extractWeekOfMonth(events),
    month: extractMonth(events),
  }
}

export function jsDivergence(p: ProbabilityDistribution, q: ProbabilityDistribution): number {
  const mid = p.map((pv, i) => (pv + q[i]) / 2)
  let divergence = 0
  for (let i = 0; i < p.length; i++) {
    if (p[i] > 0) divergence += p[i] * Math.log(p[i] / mid[i])
    if (q[i] > 0) divergence += q[i] * Math.log(q[i] / mid[i])
  }
  return divergence / 2
}
