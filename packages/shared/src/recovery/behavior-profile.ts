import type { PaymentFeatures } from './feature-extractor/payment'
import type { CommunicationFeatures } from './feature-extractor/communication'
import type { TemporalFeatures } from './feature-extractor/temporal'
import type { RelationshipFeatures } from './feature-extractor/relationship'
import type { RiskFeatures } from './feature-extractor/risk'
import type { DriftReport } from './learning/drift'
import type { FieldConfidenceMap } from './confidence'

export interface ObservedBehavior {
  payment: PaymentFeatures
  communication: CommunicationFeatures
  temporal: TemporalFeatures
  relationship: RelationshipFeatures
}

export interface LiquidityWindow {
  dayOfWeek: number
  startHour: number
  endHour: number
  confidence: number
}

export interface DerivedBehavior {
  liquidityWindow: LiquidityWindow
  riskScore: number
  stabilityScore: number
  recoveryDifficulty: 'easy' | 'medium' | 'hard'
}

export interface PredictedBehavior {
  probabilityPayToday: number
  probabilityIgnoreReminder: number
  expectedCollectionAmount: number
}

export interface CustomerBehaviorProfile {
  customerId: string
  tenantId: string
  modelVersion: string
  updatedAt: string
  eventCount: number
  observed: ObservedBehavior
  derived: DerivedBehavior
  predicted: PredictedBehavior
  confidence: {
    overall: number
    fields: FieldConfidenceMap
  }
  drift: DriftReport | null
}

export interface BusinessBehaviorProfile {
  tenantId: string
  modelVersion: string
  updatedAt: string
  customerCount: number
  avgRiskScore: number
  preferredRecoveryStyle: 'gentle' | 'balanced' | 'aggressive'
  dashboardEngagement: 'daily' | 'weekly' | 'rarely' | 'unknown'
  snoozeRate: number
  callPreference: boolean
  busiestCollectionDay: number | null
  avgReceivableAgeDays: number | null
  avgRecoveryEfficiency: number | null
  avgPaymentCycleDays: number | null
  reminderEffectiveness: number | null
  cashflowHealth: number | null
}

export { BusinessBehaviorProfile as MerchantBehaviorProfile }

export const CURRENT_MODEL_VERSION = '1.0.0'

export function createEmptyCustomerProfile(customerId: string, tenantId: string): CustomerBehaviorProfile {
  return {
    customerId,
    tenantId,
    modelVersion: CURRENT_MODEL_VERSION,
    updatedAt: new Date().toISOString(),
    eventCount: 0,
    observed: {
      payment: {
        avgSettlementDelayHours: 0,
        avgPaymentAmount: 0,
        partialPaymentRate: 0,
        promiseKeepingRate: 0,
        earlyPaymentRate: 0,
        latePaymentRate: 0,
        paymentCount: 0,
        promiseCount: 0,
      },
      communication: {
        readRate: 0,
        ignoreRate: 0,
        clickToPayLatencyHours: 0,
        responseDelayHours: 0,
        totalRemindersSent: 0,
        totalReads: 0,
        totalClicks: 0,
      },
      temporal: {
        histograms: {
          hourOfDay: new Array(24).fill(0),
          dayOfWeek: new Array(7).fill(0),
          weekOfMonth: new Array(5).fill(0),
          month: new Array(12).fill(0),
        },
        preferredDayOfWeek: 0,
        preferredHourRange: { start: 9, end: 17 },
        salaryWeekBias: 'none',
        monthEndBias: false,
        weekendBias: 'none',
      },
      relationship: {
        preferredAction: 'reminder',
        communicationPreference: 'unknown',
        respondsToCall: false,
        respondsToReminder: false,
      },
    },
    derived: {
      liquidityWindow: { dayOfWeek: 5, startHour: 9, endHour: 17, confidence: 0 },
      riskScore: 0,
      stabilityScore: 0,
      recoveryDifficulty: 'medium',
    },
    predicted: {
      probabilityPayToday: 0,
      probabilityIgnoreReminder: 0,
      expectedCollectionAmount: 0,
    },
    confidence: { overall: 0, fields: {} },
    drift: null,
  }
}

export function createEmptyBusinessProfile(tenantId: string): BusinessBehaviorProfile {
  return {
    tenantId,
    modelVersion: CURRENT_MODEL_VERSION,
    updatedAt: new Date().toISOString(),
    customerCount: 0,
    avgRiskScore: 0,
    preferredRecoveryStyle: 'balanced',
    dashboardEngagement: 'unknown',
    snoozeRate: 0,
    callPreference: false,
    busiestCollectionDay: null,
    avgReceivableAgeDays: null,
    avgRecoveryEfficiency: null,
    avgPaymentCycleDays: null,
    reminderEffectiveness: null,
    cashflowHealth: null,
  }
}

/** @deprecated Use BusinessBehaviorProfile and createEmptyBusinessProfile */
export const createEmptyMerchantProfile = createEmptyBusinessProfile
