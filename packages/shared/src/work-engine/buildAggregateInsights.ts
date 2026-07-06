import type { CustomerBehavioralMetrics, CustomerLiquidityWindow } from '../types'
import type { BusinessInsight } from './types'

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function buildAggregateInsights(
  metricsList: CustomerBehavioralMetrics[],
  windowsList: CustomerLiquidityWindow[],
): BusinessInsight[] {
  const insights: BusinessInsight[] = []
  const active = metricsList.filter(m => m.observationCount >= 1)
  if (active.length < 1) return insights

  // Average settlement time
  const settlable = active.filter(m => m.avgSettlementLatencyHours > 0)
  if (settlable.length > 0) {
    const avgHours = settlable.reduce((s, m) => s + m.avgSettlementLatencyHours, 0) / settlable.length
    const days = avgHours / 24
    insights.push({
      observation: `Average settlement time: ${days.toFixed(1)} days`,
      type: 'trend',
    })
  }

  // Strongest collection day — count each customer's best day
  const customerBestDay = new Map<string, { day: number; score: number }>()
  for (const w of windowsList) {
    const cur = customerBestDay.get(w.customerId)
    if (!cur || w.affinityScore > cur.score) {
      customerBestDay.set(w.customerId, { day: w.weekday, score: w.affinityScore })
    }
  }
  const dayCounts = new Map<number, number>()
  for (const [, best] of customerBestDay) {
    dayCounts.set(best.day, (dayCounts.get(best.day) ?? 0) + 1)
  }
  let bestDay = -1, bestCount = 0
  for (const [day, count] of dayCounts) {
    if (count > bestCount) { bestCount = count; bestDay = day }
  }
  if (bestDay >= 0 && bestCount >= 1) {
    const label = bestCount === 1 ? 'customer' : 'customers'
    insights.push({
      observation: `${bestCount} ${label} usually pay on ${WEEKDAYS[bestDay]}`,
      type: 'pattern',
    })
  }

  // Overall collection rate
  if (active.length >= 2) {
    const avgRate = active.reduce((s, m) => s + m.paymentConversionRate, 0) / active.length
    const pct = Math.round(avgRate * 100)
    if (pct >= 70) {
      insights.push({
        observation: `${pct}% average collection rate across all customers`,
        type: 'trend',
      })
    }
  }

  // Read rate pattern — most reliable channel
  const readers = active.filter(m => m.readRate > 0)
  if (readers.length >= 2) {
    const highRead = readers.filter(m => m.readRate >= 0.7).length
    if (highRead >= 2) {
      insights.push({
        observation: `${highRead} customer${highRead > 1 ? 's' : ''} respond better to WhatsApp than calls`,
        type: 'pattern',
      })
    }
  }

  return insights
}