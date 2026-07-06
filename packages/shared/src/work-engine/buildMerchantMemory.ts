import type { CustomerBehavioralMetrics, CustomerLiquidityWindow } from '../types'
import type { MerchantMemory, MemoryCategory } from './types'

export interface MemoryInput {
  metrics: CustomerBehavioralMetrics | null
  liquidityWindows: CustomerLiquidityWindow[]
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function confidenceLabel(c: number): string {
  if (c >= 0.8) return 'high'
  if (c >= 0.5) return 'medium'
  return 'low'
}

function bestLiquidityWindow(windows: CustomerLiquidityWindow[]): { weekday: string; hour: number; score: number } | null {
  if (windows.length === 0) return null
  const best = windows.reduce((a, b) => (a.affinityScore > b.affinityScore ? a : b))
  return { weekday: WEEKDAYS[best.weekday], hour: best.hourBucket, score: best.affinityScore }
}

function formatHour(h: number): string {
  if (h === 0) return 'midnight'
  if (h < 12) return `${h} AM`
  if (h === 12) return 'noon'
  return `${h - 12} PM`
}

function observationCountConfidence(metrics: CustomerBehavioralMetrics): number {
  return 1 - Math.exp(-metrics.observationCount / 3)
}

function entropyToConfidence(overallEntropy: number): number {
  return 1 - Math.min(1, Math.max(0, overallEntropy))
}

export function buildMerchantMemory(input: MemoryInput): MerchantMemory[] {
  const { metrics, liquidityWindows } = input
  const memories: MerchantMemory[] = []

  if (!metrics || metrics.observationCount < 1) {
    return memories
  }

  const obsConf = observationCountConfidence(metrics)

  // Timing memory — from liquidity windows
  const best = bestLiquidityWindow(liquidityWindows)
  if (best && best.score >= 0.5) {
    const baseConf = Math.min(1, best.score / 3)
    const conf = Math.round(Math.min(baseConf, obsConf) * 100) / 100
    if (conf >= 0.2) {
      memories.push({
        category: 'timing',
        confidence: conf,
        observation: `Usually pays ${best.weekday} ${formatHour(best.hour)}`,
        observedPayments: metrics.observationCount,
      })
    }
  }

  // Payment memory — from settlement latency
  if (metrics.observationCount > 0) {
    const days = metrics.avgSettlementLatencyHours / 24
    const conf = Math.round(Math.min(0.6 + 0.3 * (1 - Math.min(1, days / 7)), obsConf) * 100) / 100
    if (days <= 0.5) {
      memories.push({
        category: 'payment',
        confidence: conf,
        observation: 'Usually settles before due date',
      })
    } else if (days <= 1) {
      memories.push({
        category: 'payment',
        confidence: conf,
        observation: 'Usually settles within a day',
      })
    } else if (days <= 3) {
      memories.push({
        category: 'payment',
        confidence: conf,
        observation: 'Usually settles within a few days',
      })
    } else {
      memories.push({
        category: 'payment',
        confidence: conf,
        observation: `Usually settles within ${Math.round(days)} days`,
      })
    }
  }

  // Channel memory — from read rate
  if (metrics.readRate > 0) {
    const conf = Math.round(Math.min(0.3 + metrics.readRate * 0.4, obsConf) * 100) / 100
    if (metrics.readRate >= 0.8) {
      memories.push({
        category: 'channel',
        confidence: conf,
        observation: 'Reads reminders reliably',
      })
    } else if (metrics.readRate >= 0.4) {
      memories.push({
        category: 'channel',
        confidence: conf,
        observation: 'Usually reads reminders',
      })
    } else {
      memories.push({
        category: 'channel',
        confidence: conf,
        observation: 'Phone calls work better than reminders',
      })
    }
  }

  // Reliability memory — from payment conversion rate
  if (metrics.paymentConversionRate > 0) {
    const pct = Math.round(metrics.paymentConversionRate * 100)
    const conf = Math.round(Math.min(0.3 + metrics.paymentConversionRate * 0.4, obsConf) * 100) / 100
    if (pct >= 90) {
      memories.push({
        category: 'reliability',
        confidence: conf,
        observation: `Very reliable — ${pct}% payment rate`,
      })
    } else if (pct >= 70) {
      memories.push({
        category: 'reliability',
        confidence: conf,
        observation: `Reliable — ${pct}% payment rate`,
      })
    } else {
      memories.push({
        category: 'reliability',
        confidence: conf,
        observation: `${pct}% payment rate`,
      })
    }
  }

  // Response memory — from reminder response time
  if (metrics.avgReminderResponseHours > 0) {
    const h = metrics.avgReminderResponseHours
    const conf = Math.round(Math.min(0.3 + 0.3 * (1 - Math.min(1, h / 48)), obsConf) * 100) / 100
    if (h <= 2) {
      memories.push({
        category: 'response',
        confidence: conf,
        observation: 'Responds within 2 hours',
      })
    } else if (h <= 12) {
      memories.push({
        category: 'response',
        confidence: conf,
        observation: `Responds within ${Math.round(h)} hours`,
      })
    } else if (h <= 48) {
      memories.push({
        category: 'response',
        confidence: conf,
        observation: 'Responds within a day or two',
      })
    }
  }

  return memories
    .map(m => ({ ...m, observedPayments: m.observedPayments ?? metrics.observationCount }))
    .sort((a, b) => b.confidence - a.confidence)
}
