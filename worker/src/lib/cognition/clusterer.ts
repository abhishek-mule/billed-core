import type { CorrelationGroup, SituationCandidate, NarrativeSeed } from './types'

const CUSTOMER_NAMES = new Map<string, string>()

export function setCustomerNameCache(names: Record<string, string>): void {
  for (const [id, name] of Object.entries(names)) {
    CUSTOMER_NAMES.set(id, name)
  }
}

export function cluster(groups: Map<string, CorrelationGroup>): SituationCandidate[] {
  const candidates: SituationCandidate[] = []

  for (const group of groups.values()) {
    const customerId = Array.from(group.signals.customerIds)[0]
    const customerName = customerId ? (CUSTOMER_NAMES.get(customerId) || 'Unknown') : 'Unknown'

    const maxStage = group.signals.stageLevels.length > 0 ? Math.max(...group.signals.stageLevels) : 0
    const stageLabel = maxStage >= 4 ? 'Critical escalation'
      : maxStage >= 3 ? 'Escalation stage'
      : maxStage >= 2 ? 'Follow-up stage'
      : maxStage >= 1 ? 'Initial outreach'
      : null

    const windowInfo = computeBestWindow(group)

    const seed: NarrativeSeed = {
      entityCount: group.entities.invoices.size,
      totalAmount: group.signals.totalAmount,
      customerName,
      maxUrgency: group.signals.maxUrgency,
      windowInfo,
      stageLabel,
      customerBehavior: {
        readRate: group.signals.readRate,
        delayLikelihood: group.signals.delayLikelihood,
      },
    }

    const priorityScore = computePriorityScore(group)
    const correlationKey = group.key

    candidates.push({
      situationType: group.situationType,
      correlationKey,
      headline: '',  // filled by synthesizer
      narrativeSeed: seed,
      affectedEntities: {
        invoices: Array.from(group.entities.invoices),
        customers: Array.from(group.entities.customers),
        payments: Array.from(group.entities.payments),
      },
      attentionIds: group.attentionIds,
      priorityScore,
    })
  }

  return candidates
}

function computePriorityScore(group: CorrelationGroup): number {
  const amountScore = Math.min(group.signals.totalAmount / 100000, 1) * 20
  const urgencyScore = ({ critical: 40, high: 25, medium: 10, low: 0 })[group.signals.maxUrgency]
  const delayPenalty = group.signals.delayLikelihood !== null ? group.signals.delayLikelihood * 10 : 0
  const densityBonus = Math.min(group.entities.invoices.size / 5, 1) * 10
  return amountScore + urgencyScore + densityBonus - delayPenalty
}

function computeBestWindow(group: CorrelationGroup): { bestStart: string; bestEnd: string } | null {
  const now = new Date()
  const hour = now.getHours()
  // Simple heuristic: best window is next 4 hours if within business hours (9AM-6PM)
  if (hour >= 9 && hour < 18) {
    const end = new Date(now)
    end.setHours(Math.min(hour + 4, 18))
    return {
      bestStart: now.toISOString(),
      bestEnd: end.toISOString(),
    }
  }
  // Outside business hours — tomorrow morning
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(9, 0, 0, 0)
  const tomorrowEnd = new Date(tomorrow)
  tomorrowEnd.setHours(12, 0, 0, 0)
  return {
    bestStart: tomorrow.toISOString(),
    bestEnd: tomorrowEnd.toISOString(),
  }
}
