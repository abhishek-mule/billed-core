import type { NormalizedRecoveryEvent } from './normalized-event'
import type {
  CustomerBehaviorProfile,
  BusinessBehaviorProfile,
} from './behavior-profile'
import {
  CURRENT_MODEL_VERSION,
  createEmptyCustomerProfile,
  createEmptyBusinessProfile,
} from './behavior-profile'
import { extractPaymentFeatures } from './feature-extractor/payment'
import { extractCommunicationFeatures } from './feature-extractor/communication'
import { extractTemporalFeatures } from './feature-extractor/temporal'
import { extractRelationshipFeatures } from './feature-extractor/relationship'
import { extractRiskFeatures } from './feature-extractor/risk'
import type {
  PaymentFeatures,
  CommunicationFeatures,
  TemporalFeatures,
  RelationshipFeatures,
  RiskFeatures,
} from './feature-extractor'
import { computeFieldConfidence, computeOverallConfidence } from './confidence'
import {
  updateBelief,
  posteriorMean,
  posteriorVariance,
  combineHierarchicalPriors,
  sampleSizeToWeight,
} from './learning/bayesian'
import { detectHistogramDrift } from './learning/drift'
import type { DriftConfig } from './learning/drift'
import { DEFAULT_DRIFT_CONFIG } from './learning/drift'

export interface LearningEngineInput {
  customerEvents: NormalizedRecoveryEvent[]
  merchantEvents: NormalizedRecoveryEvent[]
  previousProfile: CustomerBehaviorProfile | null
  previousBusinessProfile: BusinessBehaviorProfile | null
  merchantPrior: { alpha: number; beta: number } | null
  industryPrior: { alpha: number; beta: number } | null
  driftConfig?: DriftConfig
}

export interface LearningEngineExplanation {
  summary: string
  keyFeatures: string[]
  liquidityWindow: { dayOfWeek: number; startHour: number; endHour: number } | null
  riskScore: number
  stabilityScore: number
  confidence: number
  modelVersion: string
  driftDetected: boolean
}

export interface LearningEngineOutput {
  customerProfile: CustomerBehaviorProfile
  businessProfile: BusinessBehaviorProfile
  recomputedAt: string
  explanation: LearningEngineExplanation
  features: {
    payment: PaymentFeatures
    communication: CommunicationFeatures
    temporal: TemporalFeatures
    relationship: RelationshipFeatures
    risk: RiskFeatures
  }
}

export class LearningEngine {
  compute(input: LearningEngineInput): LearningEngineOutput {
    const { customerEvents, previousProfile, driftConfig } = input
    const now = new Date().toISOString()

    const payment = extractPaymentFeatures(customerEvents)
    const communication = extractCommunicationFeatures(customerEvents)
    const temporal = extractTemporalFeatures(customerEvents)
    const relationship = extractRelationshipFeatures(customerEvents)
    const risk = extractRiskFeatures(customerEvents, relationship)

    const observed = { payment, communication, temporal, relationship }
    const derived = {
      liquidityWindow: {
        dayOfWeek: temporal.preferredDayOfWeek,
        startHour: temporal.preferredHourRange.start,
        endHour: temporal.preferredHourRange.end,
        confidence: computeFieldConfidence(customerEvents.length, posteriorVariance(
          updateBelief({ alpha: 1, beta: 1 }, payment.paymentCount, customerEvents.length),
        )),
      },
      riskScore: risk.riskScore,
      stabilityScore: risk.stabilityScore,
      recoveryDifficulty: risk.recoveryDifficulty,
    }

    const fieldConfidences: Record<string, number> = {
      avgSettlementDelayHours: computeFieldConfidence(payment.paymentCount, 0.3),
      avgPaymentAmount: computeFieldConfidence(payment.paymentCount, 0.4),
      readRate: computeFieldConfidence(communication.totalReads, 0.2),
      preferredDayOfWeek: computeFieldConfidence(customerEvents.length, 0.3),
    }
    const overallConfidence = computeOverallConfidence(fieldConfidences)

    const belief = updateBelief(
      { alpha: 1, beta: 1 },
      payment.paymentCount,
      customerEvents.length,
    )
    const predicted = {
      probabilityPayToday: posteriorMean(belief),
      probabilityIgnoreReminder: 1 - communication.readRate,
      expectedCollectionAmount: payment.avgPaymentAmount * posteriorMean(belief),
    }

    let drift = previousProfile?.drift ?? null
    if (previousProfile && customerEvents.length >= (driftConfig?.minimumSamples ?? DEFAULT_DRIFT_CONFIG.minimumSamples)) {
      drift = detectHistogramDrift(
        [
          temporal.histograms.hourOfDay,
          temporal.histograms.dayOfWeek,
        ],
        [
          previousProfile.observed.temporal.histograms.hourOfDay,
          previousProfile.observed.temporal.histograms.dayOfWeek,
        ],
        ['hourOfDay', 'dayOfWeek'],
        driftConfig,
      )
    }

    const profile: CustomerBehaviorProfile = {
      customerId: customerEvents.length > 0 ? customerEvents[0].customerId : previousProfile?.customerId ?? 'unknown',
      tenantId: customerEvents.length > 0 ? customerEvents[0].tenantId : previousProfile?.tenantId ?? 'unknown',
      modelVersion: CURRENT_MODEL_VERSION,
      updatedAt: now,
      eventCount: customerEvents.length,
      observed,
      derived,
      predicted,
      confidence: {
        overall: overallConfidence,
        fields: fieldConfidences,
      },
      drift,
    }

    const businessProfile = this.computeBusinessProfile(input, profile)
    const explanation = this.buildExplanation(profile, relationship)

    return {
      customerProfile: profile,
      businessProfile,
      recomputedAt: now,
      explanation,
      features: { payment, communication, temporal, relationship, risk },
    }
  }

  private buildExplanation(
    profile: CustomerBehaviorProfile,
    relationship: RelationshipFeatures,
  ): LearningEngineExplanation {
    const lw = profile.derived.liquidityWindow
    const features: string[] = []
    if (relationship.respondsToReminder) features.push('responds_to_reminders')
    if (relationship.respondsToCall) features.push('responds_to_calls')
    if (lw.confidence > 0.5) features.push('known_liquidity_window')
    if (profile.observed.communication.readRate > 0.5) features.push('high_read_rate')
    if (profile.observed.payment.promiseKeepingRate > 0.5) features.push('keeps_promises')
    if (profile.derived.stabilityScore > 0.5) features.push('stable_payer')

    const riskLabel = profile.derived.riskScore > 50 ? 'high' : profile.derived.riskScore > 25 ? 'medium' : 'low'

    return {
      summary: `${riskLabel} risk customer with ${features.length > 0 ? features.join(', ') : 'limited data'}`,
      keyFeatures: features,
      liquidityWindow: lw.confidence > 0 ? { dayOfWeek: lw.dayOfWeek, startHour: lw.startHour, endHour: lw.endHour } : null,
      riskScore: profile.derived.riskScore,
      stabilityScore: profile.derived.stabilityScore,
      confidence: profile.confidence.overall,
      modelVersion: CURRENT_MODEL_VERSION,
      driftDetected: profile.drift?.hasDrifted ?? false,
    }
  }

  private computeBusinessProfile(
    input: LearningEngineInput,
    customerProfile: CustomerBehaviorProfile,
  ): BusinessBehaviorProfile {
    const prev = input.previousBusinessProfile ?? createEmptyBusinessProfile(
      input.merchantEvents[0]?.tenantId ?? 'unknown',
    )

    if (customerProfile.eventCount === 0) return prev

    const custRisk = customerProfile.derived.riskScore
    const weightedAvg = prev.avgRiskScore * prev.customerCount + custRisk
    const newCount = prev.customerCount + 1
    const avgRisk = weightedAvg / newCount

    const snoozeEvents = input.customerEvents.filter(e => e.type === 'snooze_requested')
    const snoozeRate = input.customerEvents.length > 0 ? snoozeEvents.length / input.customerEvents.length : prev.snoozeRate

    let style: BusinessBehaviorProfile['preferredRecoveryStyle'] = 'balanced'
    if (avgRisk > 50) style = 'aggressive'
    else if (avgRisk < 25) style = 'gentle'

    const callEvents = input.merchantEvents.filter(e => e.type === 'call')
    const callPreference = callEvents.length > 3

    const avgDelay = customerProfile.observed.payment.avgSettlementDelayHours
    const avgCycle = avgDelay > 0 ? avgDelay / 24 : null
    const efficiency = customerProfile.observed.payment.paymentCount > 0
      ? Math.min(1, customerProfile.observed.payment.paymentCount / (customerProfile.observed.payment.paymentCount + input.customerEvents.filter(e => e.type === 'reminder_sent').length))
      : null

    return {
      tenantId: prev.tenantId,
      modelVersion: CURRENT_MODEL_VERSION,
      updatedAt: new Date().toISOString(),
      customerCount: newCount,
      avgRiskScore: avgRisk,
      preferredRecoveryStyle: style,
      dashboardEngagement: prev.dashboardEngagement,
      snoozeRate,
      callPreference,
      busiestCollectionDay: customerProfile.observed.temporal.preferredDayOfWeek,
      avgReceivableAgeDays: avgCycle,
      avgRecoveryEfficiency: efficiency,
      avgPaymentCycleDays: avgCycle,
      reminderEffectiveness: customerProfile.observed.communication.readRate,
      cashflowHealth: prev.cashflowHealth,
    }
  }
}
