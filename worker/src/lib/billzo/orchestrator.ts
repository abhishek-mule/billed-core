// ============================================================
// ORCHESTRATOR — Pure functional policy engine
// ============================================================
// This module is the inference→policy boundary.
// It NEVER sends messages, reads databases, or checks rate limits.
// It accepts a pure OrchestrationInput and returns a deterministic
// SendRecommendation.
//
// Determinism guarantee: same input → same output.
// This is essential for replay verification.
// ============================================================

import {
  type OrchestrationInput,
  type SendRecommendation,
  type SendTiming,
  type SendChannel,
  type SendContent,
  type SendCadence,
  type EscalationDecision,
  type MessageTone,
  type OptimalSendWindow,
  type DecisionRuleTrace,
  type DecisionConfidence,
  type BuildRecommendationResult,
  DEFAULT_SEND_RECOMMENDATION,
} from '@billzo/shared'

// ============================================================
// CONSTANTS
// ============================================================

const MIN_OBSERVATIONS_FOR_BEHAVIORAL = 3
const HIGH_CHANNEL_VIABILITY = 0.6
const MEDIUM_CHANNEL_VIABILITY = 0.3
const HIGH_DISPUTE_RISK = 0.5
const HIGH_DELAY_LIKELIHOOD = 0.5
const HIGH_CONSTRAINT_AFFINITY = 0.5
const ESCALATION_IGNORE_THRESHOLD = 3
const ESCALATION_AMOUNT_RATIO = 2.0
const ESCALATION_DISPUTE_THRESHOLD = 0.4
const FORCE_ESCALATION_IGNORE = 4
const SOFT_SOAK_DAYS = 2
const DEFAULT_FOLLOW_UP_DAYS = 3

// Confidence calibration constants
const CONFIDENCE_OBS_TIMING = 30
const CONFIDENCE_OBS_CHANNEL = 20
const CONFIDENCE_OBS_CADENCE = 25
const CONFIDENCE_OBS_ESCALATION = 15

// ============================================================
// HELPERS
// ============================================================

function isWithinOperatingHours(
  hour: number,
  weekday: number,
  operatingHours: OrchestrationInput['operatingHours'],
): boolean {
  if (operatingHours.quietDays.includes(weekday)) return false
  if (operatingHours.quietAfter) {
    const quietHour = parseInt(operatingHours.quietAfter.split(':')[0], 10)
    if (hour >= quietHour) return false
  }
  if (!operatingHours.enabled) return true
  return operatingHours.windows.some(w => {
    const startHour = parseInt(w.start.split(':')[0], 10)
    const endHour = parseInt(w.end.split(':')[0], 10)
    return hour >= startHour && hour < endHour
  })
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function priorScore(source: string): number {
  switch (source) {
    case 'customer': return 1.0
    case 'segment': return 0.7
    case 'tenant': return 0.5
    case 'global': return 0.3
    default: return 0.1
  }
}

// ============================================================
// RULE TRACE BUILDER
// ============================================================

function tr(ruleId: string, inputs: Record<string, number>, outcome: boolean, threshold?: number, contributionWeight?: number): DecisionRuleTrace {
  return { ruleId, inputs, threshold, outcome, contributionWeight }
}

// ============================================================
// DECISION CONFIDENCE
// ============================================================

export function computeDecisionConfidence(
  context: OrchestrationInput['context'],
  transportConfidence: number,
): DecisionConfidence {
  const obsCount = context.observationCount
  const entropy = context.entropy
  const ps = priorScore(context.priorSource)

  const rawTiming = clamp(obsCount / CONFIDENCE_OBS_TIMING, 0, 1) * (1 - entropy) * ps
  const rawChannel = clamp(obsCount / CONFIDENCE_OBS_CHANNEL, 0, 1) * context.traits.channelViability.value * ps
  const rawCadence = clamp(obsCount / CONFIDENCE_OBS_CADENCE, 0, 1) * (1 - context.traits.strategicDelayLikelihood.value) * ps
  const rawEscalation = clamp(obsCount / CONFIDENCE_OBS_ESCALATION, 0, 1) * ps

  // Transport awareness: low telemetry quality dampens all confidence
  const tc = clamp(transportConfidence, 0, 1)

  return {
    timing: clamp(rawTiming * tc, 0, 1),
    channel: clamp(rawChannel * tc, 0, 1),
    cadence: clamp(rawCadence * tc, 0, 1),
    escalation: clamp(rawEscalation * tc, 0, 1),
    transport: tc,
  }
}

// ============================================================
// DECISION: SEND TIMING
// ============================================================

export function decideSendTiming(
  input: OrchestrationInput,
  traces?: DecisionRuleTrace[],
): SendTiming {
  const { context, invoice, operatingHours } = input
  const now = new Date()
  const currentHour = now.getHours()
  const currentWeekday = now.getDay()
  const isOperating = isWithinOperatingHours(currentHour, currentWeekday, operatingHours)

  const temporalRegularity = context.traits.temporalRegularity.value
  const disputeRisk = context.traits.disputeRisk.value
  const obsCount = context.observationCount
  const hasEnoughData = obsCount >= MIN_OBSERVATIONS_FOR_BEHAVIORAL

  let immediate = false
  let delayMinutes = 0
  let preferredWindow: OptimalSendWindow | null = null

  if (!hasEnoughData) {
    traces?.push(tr('timing.sparse.data', { obsCount, minObs: MIN_OBSERVATIONS_FOR_BEHAVIORAL }, false, MIN_OBSERVATIONS_FOR_BEHAVIORAL))
    if (isOperating) {
      immediate = true
      traces?.push(tr('timing.sparse.operating_hours', { currentHour, currentWeekday }, true))
    } else {
      const nextWindow = operatingHours.windows[0]
      if (nextWindow) {
        const nextHour = parseInt(nextWindow.start.split(':')[0], 10)
        delayMinutes = ((nextHour - currentHour + 24) % 24) * 60
        if (delayMinutes === 0) delayMinutes = 60
      } else {
        delayMinutes = 60
      }
      traces?.push(tr('timing.sparse.delayed', { delayMinutes }, false))
    }
    return { immediate, delayMinutes, preferredWindow }
  }

  traces?.push(tr('timing.sufficient.data', { obsCount, minObs: MIN_OBSERVATIONS_FOR_BEHAVIORAL }, true, MIN_OBSERVATIONS_FOR_BEHAVIORAL))

  if (temporalRegularity > 0.6) {
    traces?.push(tr('timing.high_regularity', { temporalRegularity }, true, 0.6))
    const hourBucket = Math.round(temporalRegularity * 10) % 24
    const weekday = Math.round(temporalRegularity * 3) % 7
    preferredWindow = {
      hour: hourBucket,
      weekday,
      confidence: temporalRegularity,
    }

    const hourDiff = Math.abs(currentHour - hourBucket)
    if (hourDiff <= 2 && currentWeekday === weekday && isOperating) {
      immediate = true
      traces?.push(tr('timing.preferred_window.now', { hourDiff, currentWeekday, weekday }, true, 2))
    } else {
      let daysAhead = (weekday - currentWeekday + 7) % 7
      if (daysAhead === 0 && hourDiff <= 2) daysAhead = 0
      delayMinutes = daysAhead * 24 * 60 + ((hourBucket - currentHour + 24) % 24) * 60
      if (delayMinutes < 30) delayMinutes = 30
      traces?.push(tr('timing.preferred_window.delayed', { delayMinutes, daysAhead }, false))
    }
  } else {
    traces?.push(tr('timing.low_regularity', { temporalRegularity }, false, 0.6))
    if (isOperating) {
      immediate = true
      traces?.push(tr('timing.low_regularity.operating_hours', { currentHour, currentWeekday }, true))
    } else {
      const nextWindow = operatingHours.windows[0]
      if (nextWindow) {
        const nextHour = parseInt(nextWindow.start.split(':')[0], 10)
        delayMinutes = ((nextHour - currentHour + 24) % 24) * 60
        if (delayMinutes === 0) delayMinutes = 60
      } else {
        delayMinutes = 60
      }
      traces?.push(tr('timing.low_regularity.delayed', { delayMinutes }, false))
    }
  }

  if (disputeRisk > HIGH_DISPUTE_RISK && immediate) {
    delayMinutes = SOFT_SOAK_DAYS * 24 * 60
    immediate = false
    traces?.push(tr('timing.dispute_soak', { disputeRisk, soakMinutes: delayMinutes }, false, HIGH_DISPUTE_RISK))
  }

  return { immediate, delayMinutes, preferredWindow }
}

// ============================================================
// DECISION: CHANNEL
// ============================================================

export function decideChannel(
  input: OrchestrationInput,
  traces?: DecisionRuleTrace[],
): SendChannel {
  const channelViability = input.context.traits.channelViability.value

  let priority: SendChannel['priority']
  if (channelViability >= HIGH_CHANNEL_VIABILITY) {
    priority = 'whatsapp'
    traces?.push(tr('channel.viability.high', { channelViability }, true, HIGH_CHANNEL_VIABILITY))
  } else if (channelViability >= MEDIUM_CHANNEL_VIABILITY) {
    priority = 'whatsapp_then_push'
    traces?.push(tr('channel.viability.medium', { channelViability }, true, MEDIUM_CHANNEL_VIABILITY))
  } else {
    priority = 'push_only'
    traces?.push(tr('channel.viability.low', { channelViability }, false, MEDIUM_CHANNEL_VIABILITY))
  }

  return { priority, channelViability }
}

// ============================================================
// DECISION: CONTENT TONE
// ============================================================

export function decideContentTone(
  input: OrchestrationInput,
  traces?: DecisionRuleTrace[],
): SendContent {
  const { context, invoice } = input
  const disputeRisk = context.traits.disputeRisk.value
  const strategicDelay = context.traits.strategicDelayLikelihood.value
  const constraintAffinity = context.traits.constraintAffinity.value
  const daysOverdue = invoice.daysOverdue
  const amountRatio = invoice.amountRatio
  const stage = invoice.currentStage

  let tone: MessageTone
  let effectiveStage = stage

  if (disputeRisk > 0.5) {
    tone = 'soft'
    traces?.push(tr('content.tone.dispute_high', { disputeRisk }, true, 0.5, 1.0))
  } else if (daysOverdue > 15 && amountRatio > 2.0) {
    tone = 'urgent'
    effectiveStage = 't5_warning'
    traces?.push(tr('content.tone.urgent', { daysOverdue, amountRatio }, true, undefined, 0.9))
  } else if (daysOverdue > 7 || stage === 't72_strong' || stage === 't5_warning') {
    tone = 'firm'
    traces?.push(tr('content.tone.firm_overdue', { daysOverdue }, true, 7, 0.7))
  } else if (strategicDelay > 0.5) {
    tone = 'firm'
    traces?.push(tr('content.tone.firm_delay', { strategicDelay }, true, 0.5, 0.6))
  } else if (constraintAffinity > 0.5) {
    tone = 'firm'
    traces?.push(tr('content.tone.firm_constraint', { constraintAffinity }, true, 0.5, 0.5))
  } else {
    tone = stage === 't0_soft' ? 'soft' : stage === 't24_nudge' ? 'neutral' : 'firm'
    traces?.push(tr('content.tone.default', {}, true, undefined, 0.3))
  }

  return { tone, stage: effectiveStage }
}

// ============================================================
// DECISION: CADENCE
// ============================================================

export function decideCadence(
  input: OrchestrationInput,
  traces?: DecisionRuleTrace[],
): SendCadence {
  const { context, invoice } = input
  const constraintAffinity = context.traits.constraintAffinity.value
  const strategicDelay = context.traits.strategicDelayLikelihood.value
  const temporalRegularity = context.traits.temporalRegularity.value
  const hasEnoughData = context.observationCount >= MIN_OBSERVATIONS_FOR_BEHAVIORAL

  let nextFollowUpDays: number
  if (!hasEnoughData) {
    nextFollowUpDays = DEFAULT_FOLLOW_UP_DAYS
    traces?.push(tr('cadence.sparse', { obsCount: context.observationCount }, true, MIN_OBSERVATIONS_FOR_BEHAVIORAL, 0.3))
  } else if (constraintAffinity > HIGH_CONSTRAINT_AFFINITY) {
    nextFollowUpDays = 1
    traces?.push(tr('cadence.constraint_high', { constraintAffinity }, true, HIGH_CONSTRAINT_AFFINITY, 0.8))
  } else if (constraintAffinity >= 0.3) {
    nextFollowUpDays = 2
    traces?.push(tr('cadence.constraint_medium', { constraintAffinity }, true, 0.3, 0.6))
  } else {
    nextFollowUpDays = 4
    traces?.push(tr('cadence.constraint_low', { constraintAffinity }, false, 0.3, 0.4))
  }

  let maxFollowUps: number
  if (strategicDelay > HIGH_DELAY_LIKELIHOOD) {
    maxFollowUps = 6
    traces?.push(tr('cadence.max_followups.high_delay', { strategicDelay }, true, HIGH_DELAY_LIKELIHOOD, 0.7))
  } else if (strategicDelay > 0.3) {
    maxFollowUps = 5
    traces?.push(tr('cadence.max_followups.medium_delay', { strategicDelay }, true, 0.3, 0.5))
  } else {
    maxFollowUps = 4
    traces?.push(tr('cadence.max_followups.low_delay', { strategicDelay }, false, 0.3, 0.3))
  }

  const shouldSkipStage = hasEnoughData && temporalRegularity > 0.6 && invoice.daysOverdue <= 3
  if (shouldSkipStage) {
    traces?.push(tr('cadence.skip_stage', { temporalRegularity, daysOverdue: invoice.daysOverdue }, true, 0.6, 0.5))
  }

  return { nextFollowUpDays, maxFollowUps, shouldSkipStage }
}

// ============================================================
// DECISION: ESCALATION
// ============================================================

export function decideEscalation(
  input: OrchestrationInput,
  traces?: DecisionRuleTrace[],
): EscalationDecision {
  const { context, invoice } = input
  const disputeRisk = context.traits.disputeRisk.value
  const temporalRegularity = context.traits.temporalRegularity.value
  const ignoreCount = invoice.ignoreCount
  const amountRatio = invoice.amountRatio
  const hasEnoughData = context.observationCount >= MIN_OBSERVATIONS_FOR_BEHAVIORAL

  if (ignoreCount >= FORCE_ESCALATION_IGNORE) {
    traces?.push(tr('escalation.force', { ignoreCount }, true, FORCE_ESCALATION_IGNORE, 1.0))
    return {
      shouldEscalate: true,
      reason: `Customer has ignored ${ignoreCount} consecutive reminders`,
    }
  }

  if (hasEnoughData) {
    if (temporalRegularity > 0.6 && ignoreCount >= 2) {
      traces?.push(tr('escalation.regular_ignore', { temporalRegularity, ignoreCount }, true, undefined, 0.9))
      return {
        shouldEscalate: true,
        reason: `Customer reads regularly (regularity=${temporalRegularity.toFixed(2)}) but ignores reminders`,
      }
    }

    if (ignoreCount >= ESCALATION_IGNORE_THRESHOLD && amountRatio > ESCALATION_AMOUNT_RATIO && disputeRisk > ESCALATION_DISPUTE_THRESHOLD) {
      traces?.push(tr('escalation.high_value_dispute', { ignoreCount, amountRatio, disputeRisk }, true, undefined, 0.8))
      return {
        shouldEscalate: true,
        reason: `High value invoice (${amountRatio.toFixed(1)}x avg) ignored ${ignoreCount}x with dispute risk ${disputeRisk.toFixed(2)}`,
      }
    }
  } else {
    if (ignoreCount >= ESCALATION_IGNORE_THRESHOLD && amountRatio > ESCALATION_AMOUNT_RATIO) {
      traces?.push(tr('escalation.high_value_sparse', { ignoreCount, amountRatio }, true, undefined, 0.6))
      return {
        shouldEscalate: true,
        reason: `High value invoice (${amountRatio.toFixed(1)}x avg) ignored ${ignoreCount}x`,
      }
    }
  }

  traces?.push(tr('escalation.no_action', { ignoreCount, amountRatio, disputeRisk, hasEnoughData: hasEnoughData ? 1 : 0 }, false))
  return { shouldEscalate: false, reason: null }
}

// ============================================================
// RECOMMENDATION RATIONALE (human-readable)
// ============================================================

export function buildRationale(input: OrchestrationInput, timing: SendTiming, channel: SendChannel, content: SendContent, cadence: SendCadence, escalation: EscalationDecision): string[] {
  const r: string[] = []
  const { context } = input
  const obsCount = context.observationCount
  const priorSrc = context.priorSource

  if (obsCount >= MIN_OBSERVATIONS_FOR_BEHAVIORAL) {
    r.push(`observationCount=${obsCount} ≥ ${MIN_OBSERVATIONS_FOR_BEHAVIORAL} → behavioral data sufficient`)
  } else {
    r.push(`observationCount=${obsCount} < ${MIN_OBSERVATIONS_FOR_BEHAVIORAL} → sparse regime, using operating hours`)
  }

  const tr = context.traits.temporalRegularity.value
  const ps = priorScore(priorSrc)
  r.push(`priorSource=${priorSrc} (priorScore=${ps.toFixed(2)})`)

  if (timing.immediate) {
    r.push(`timing: immediate`)
  } else {
    r.push(`timing: delayed ${timing.delayMinutes}min`)
  }

  r.push(`channel: ${channel.priority} (viability=${channel.channelViability.toFixed(2)})`)
  r.push(`tone: ${content.tone} (stage=${content.stage})`)
  r.push(`cadence: ${cadence.nextFollowUpDays} days, maxFollowUps=${cadence.maxFollowUps}${cadence.shouldSkipStage ? ', skipStage' : ''}`)

  if (escalation.shouldEscalate) {
    r.push(`escalation: YES — ${escalation.reason}`)
  } else {
    r.push('escalation: no')
  }

  return r
}

// ============================================================
// MAIN ENTRY POINTS
// ============================================================

export function buildRecommendationFull(input: OrchestrationInput): BuildRecommendationResult {
  const { context, invoice, operatingHours } = input
  const traces: DecisionRuleTrace[] = []

  const timing = decideSendTiming(input, traces)
  const channel = decideChannel(input, traces)
  const content = decideContentTone(input, traces)
  const cadence = decideCadence(input, traces)
  const escalation = decideEscalation(input, traces)

  const transportConfidence = input.transportConfidence ?? 0.5
  const confidence = computeDecisionConfidence(context, transportConfidence)

  if (!operatingHours.enabled) {
    const recommendation = { ...DEFAULT_SEND_RECOMMENDATION, shouldSend: false, skipReason: 'operating_hours_disabled' }
    traces.push(tr('policy.operating_hours_disabled', { enabled: 0 }, false))
    return { recommendation, traces, confidence }
  }

  if (channel.priority === 'push_only' && channel.channelViability < 0.1) {
    const recommendation = { ...DEFAULT_SEND_RECOMMENDATION, shouldSend: false, skipReason: 'no_viable_channel' }
    traces.push(tr('policy.no_viable_channel', { channelViability: channel.channelViability }, false, 0.1))
    return { recommendation, traces, confidence }
  }

  const recommendation: SendRecommendation = {
    shouldSend: channel.priority !== 'push_only' || channel.channelViability >= 0.1,
    skipReason: null,
    timing,
    channel,
    content,
    cadence,
    escalation,
  }

  return { recommendation, traces, confidence }
}

export function buildRecommendation(input: OrchestrationInput): SendRecommendation {
  return buildRecommendationFull(input).recommendation
}
