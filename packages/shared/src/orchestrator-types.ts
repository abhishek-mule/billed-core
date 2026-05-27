// ============================================================
// ORCHESTRATOR TYPES — Policy/inference boundary
// ============================================================
// The orchestrator is a pure functional policy engine.
// It accepts BehavioralRecommendationContext + invoice state
// and returns a SendRecommendation.
//
// The orchestrator NEVER:
//   - sends messages
//   - reads/writes databases
//   - checks rate limits
//   - generates message text
//
// boundary:
//   memory → inference → recommendation → policy → execution
//   (types.ts)  (traits)  (orchestrator)   (reminders queue)
// ============================================================

import type { BehavioralRecommendationContext, OperatingHoursConfig, ReminderStage } from './types'

// ============================================================
// SEND TIMING
// ============================================================

export interface OptimalSendWindow {
  hour: number
  weekday: number
  confidence: number
}

export interface SendTiming {
  immediate: boolean
  delayMinutes: number
  preferredWindow: OptimalSendWindow | null
}

// ============================================================
// CHANNEL
// ============================================================

export type ChannelPriority = 'whatsapp' | 'whatsapp_then_push' | 'push_only'

export interface SendChannel {
  priority: ChannelPriority
  channelViability: number
}

// ============================================================
// CONTENT TONE
// ============================================================

export type MessageTone = 'soft' | 'neutral' | 'firm' | 'urgent'

export interface SendContent {
  tone: MessageTone
  stage: ReminderStage
}

// ============================================================
// CADENCE — Follow-up pacing
// ============================================================

export interface SendCadence {
  nextFollowUpDays: number
  maxFollowUps: number
  shouldSkipStage: boolean
}

// ============================================================
// ESCALATION
// ============================================================

export interface EscalationDecision {
  shouldEscalate: boolean
  reason: string | null
}

// ============================================================
// SEND RECOMMENDATION — The full output
// ============================================================

export interface SendRecommendation {
  shouldSend: boolean
  skipReason: string | null
  timing: SendTiming
  channel: SendChannel
  content: SendContent
  cadence: SendCadence
  escalation: EscalationDecision
}

// ============================================================
// ORCHESTRATION INPUT — Everything the orchestrator needs
// ============================================================

export interface InvoiceOrchestrationState {
  id: string
  total: number
  daysOverdue: number
  currentStage: ReminderStage
  ignoreCount: number
  amountRatio: number
}

export interface OrchestrationInput {
  context: BehavioralRecommendationContext
  invoice: InvoiceOrchestrationState
  operatingHours: OperatingHoursConfig
}

// ============================================================
// DEFAULTS — Safe fallbacks when observationCount is 0
// ============================================================

export const DEFAULT_SEND_RECOMMENDATION: SendRecommendation = {
  shouldSend: true,
  skipReason: null,
  timing: {
    immediate: false,
    delayMinutes: 0,
    preferredWindow: null,
  },
  channel: {
    priority: 'whatsapp',
    channelViability: 0,
  },
  content: {
    tone: 'neutral',
    stage: 't0_soft',
  },
  cadence: {
    nextFollowUpDays: 3,
    maxFollowUps: 4,
    shouldSkipStage: false,
  },
  escalation: {
    shouldEscalate: false,
    reason: null,
  },
}
