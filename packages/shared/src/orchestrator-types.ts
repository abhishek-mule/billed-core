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
  transportConfidence?: number  // 0-1, computed from recent telemetry completeness; defaults to 0.5
}

// ============================================================
// DEFAULTS — Safe fallbacks when observationCount is 0
// ============================================================

// ============================================================
// DECISION RULE TRACE — Machine-replayable decision audit
// ============================================================
// Each trace records a single rule evaluation within a decision function.
// Together they form a complete, diffable audit of every orchestration decision.
// This is the foundation for policy regression testing, replay verification,
// and operator trust in autonomous behavior.
// ============================================================

export interface DecisionRuleTrace {
  ruleId: string
  inputs: Record<string, number>
  threshold?: number
  outcome: boolean
  contributionWeight?: number
}

// ============================================================
// DECISION CONFIDENCE — Per-output certainty estimation
// ============================================================
// Each sub-decision carries its own confidence derived from:
//   - observation count
//   - entropy (behavioral predictability)
//   - prior provenance (customer|segment|tenant|global|none)
//   - calibration quality (future)
//   - transport completeness
//
// This prevents the orchestrator from projecting false certainty
// onto customers with sparse or unreliable data.
// ============================================================

export interface DecisionConfidence {
  timing: number
  channel: number
  cadence: number
  escalation: number
  transport: number
}

// ============================================================
// ORCHESTRATION SNAPSHOT — Frozen decision record
// ============================================================
// Emitted as orchestration.decision.made event for forensic replay.
// Contains everything needed to explain WHY a decision was made
// without requiring current runtime code or database state.
// ============================================================

export interface BehavioralInterpreterVersions {
  entropy: string
  traits: string
  attribution: string
  calibration: string
  observation: string
}

export interface OrchestrationSnapshot {
  invoiceId: string
  customerId: string
  tenantId: string
  policyVersion: string
  orchestratorVersion: string
  inputHash: string
  interpreterVersions: BehavioralInterpreterVersions
  behavioralSnapshot: {
    traits: {
      temporalRegularity: { value: number; priorSource: string; evidenceWeight: number }
      constraintAffinity: { value: number; priorSource: string; evidenceWeight: number }
      strategicDelayLikelihood: { value: number; priorSource: string; evidenceWeight: number }
      disputeRisk: { value: number; priorSource: string; evidenceWeight: number }
      channelViability: { value: number; priorSource: string; evidenceWeight: number }
    }
    readRate: number
    channelViability: number
    entropy: number
    priorSource: string
    observationCount: number
  }
  recommendation: SendRecommendation
  decisionConfidence: DecisionConfidence
  ruleTraces: DecisionRuleTrace[]
  rationale: string[]
  executedAt: string
  triggeredBy: string
}

// ============================================================
// BUILD RECOMMENDATION RESULT — Enhanced return from buildRecommendation
// ============================================================

export interface BuildRecommendationResult {
  recommendation: SendRecommendation
  traces: DecisionRuleTrace[]
  confidence: DecisionConfidence
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
