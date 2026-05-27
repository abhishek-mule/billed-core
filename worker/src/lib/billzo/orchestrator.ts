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

// ============================================================
// DECISION: SEND TIMING
// ============================================================

export function decideSendTiming(
  input: OrchestrationInput,
): SendTiming {
  const { context, invoice, operatingHours } = input
  const now = new Date()
  const currentHour = now.getHours()
  const currentWeekday = now.getDay()
  const isOperating = isWithinOperatingHours(currentHour, currentWeekday, operatingHours)

  // Extract behavioral signals
  const temporalRegularity = context.traits.temporalRegularity.value
  const disputeRisk = context.traits.disputeRisk.value
  const obsCount = context.observationCount
  const hasEnoughData = obsCount >= MIN_OBSERVATIONS_FOR_BEHAVIORAL

  let immediate = false
  let delayMinutes = 0
  let preferredWindow: OptimalSendWindow | null = null

  if (!hasEnoughData) {
    // Sparse data → send during operating hours
    if (isOperating) {
      immediate = true
    } else {
      // Delay to next operating window
      const nextWindow = operatingHours.windows[0]
      if (nextWindow) {
        const nextHour = parseInt(nextWindow.start.split(':')[0], 10)
        delayMinutes = ((nextHour - currentHour + 24) % 24) * 60
        if (delayMinutes === 0) delayMinutes = 60
      } else {
        delayMinutes = 60
      }
    }
    return { immediate, delayMinutes, preferredWindow }
  }

  // Sufficient behavioral data
  if (temporalRegularity > 0.6) {
    // Customer has structured timing → find preferred window
    // Use hourBucket from context or fallback to operating hours
    const hourBucket = Math.round(temporalRegularity * 10) % 24
    const weekday = Math.round(temporalRegularity * 3) % 7
    preferredWindow = {
      hour: hourBucket,
      weekday,
      confidence: temporalRegularity,
    }

    // If we're in a reasonable window relative to customer preference
    const hourDiff = Math.abs(currentHour - hourBucket)
    if (hourDiff <= 2 && currentWeekday === weekday && isOperating) {
      immediate = true
    } else {
      // Schedule for preferred time
      let daysAhead = (weekday - currentWeekday + 7) % 7
      if (daysAhead === 0 && hourDiff <= 2) daysAhead = 0
      delayMinutes = daysAhead * 24 * 60 + ((hourBucket - currentHour + 24) % 24) * 60
      if (delayMinutes < 30) delayMinutes = 30
    }
  } else {
    // Low regularity → use operating hours
    if (isOperating) {
      immediate = true
    } else {
      const nextWindow = operatingHours.windows[0]
      if (nextWindow) {
        const nextHour = parseInt(nextWindow.start.split(':')[0], 10)
        delayMinutes = ((nextHour - currentHour + 24) % 24) * 60
        if (delayMinutes === 0) delayMinutes = 60
      } else {
        delayMinutes = 60
      }
    }
  }

  // If disputeRisk is high, add a soak period
  if (disputeRisk > HIGH_DISPUTE_RISK && immediate) {
    delayMinutes = SOFT_SOAK_DAYS * 24 * 60
    immediate = false
  }

  return { immediate, delayMinutes, preferredWindow }
}

// ============================================================
// DECISION: CHANNEL
// ============================================================

export function decideChannel(
  input: OrchestrationInput,
): SendChannel {
  const channelViability = input.context.traits.channelViability.value

  let priority: SendChannel['priority']
  if (channelViability >= HIGH_CHANNEL_VIABILITY) {
    priority = 'whatsapp'
  } else if (channelViability >= MEDIUM_CHANNEL_VIABILITY) {
    priority = 'whatsapp_then_push'
  } else {
    priority = 'push_only'
  }

  return { priority, channelViability }
}

// ============================================================
// DECISION: CONTENT TONE
// ============================================================

export function decideContentTone(
  input: OrchestrationInput,
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

  // High dispute risk → always soft (don't antagonize)
  if (disputeRisk > 0.5) {
    tone = 'soft'
  } else if (daysOverdue > 15 && amountRatio > 2.0) {
    tone = 'urgent'
    effectiveStage = 't5_warning'
  } else if (daysOverdue > 7 || stage === 't72_strong' || stage === 't5_warning') {
    tone = 'firm'
  } else if (strategicDelay > 0.5) {
    tone = 'firm'
  } else if (constraintAffinity > 0.5) {
    tone = 'firm'
  } else {
    // Default: map stage to tone
    tone = stage === 't0_soft' ? 'soft' : stage === 't24_nudge' ? 'neutral' : 'firm'
  }

  return { tone, stage: effectiveStage }
}

// ============================================================
// DECISION: CADENCE
// ============================================================

export function decideCadence(
  input: OrchestrationInput,
): SendCadence {
  const { context, invoice } = input
  const constraintAffinity = context.traits.constraintAffinity.value
  const strategicDelay = context.traits.strategicDelayLikelihood.value
  const temporalRegularity = context.traits.temporalRegularity.value
  const hasEnoughData = context.observationCount >= MIN_OBSERVATIONS_FOR_BEHAVIORAL

  // Next follow-up: based on constraint affinity
  // Low constraintAffinity → customer pays after few reminders → longer gap
  // High constraintAffinity → customer needs frequent reminders → shorter gap
  let nextFollowUpDays: number
  if (!hasEnoughData) {
    nextFollowUpDays = DEFAULT_FOLLOW_UP_DAYS
  } else if (constraintAffinity > HIGH_CONSTRAINT_AFFINITY) {
    nextFollowUpDays = 1
  } else if (constraintAffinity >= 0.3) {
    nextFollowUpDays = 2
  } else {
    nextFollowUpDays = 4
  }

  // Max follow-ups: based on strategic delay likelihood
  // High strategic delay → customer may be gaming → more follow-ups needed
  let maxFollowUps: number
  if (strategicDelay > HIGH_DELAY_LIKELIHOOD) {
    maxFollowUps = 6
  } else if (strategicDelay > 0.3) {
    maxFollowUps = 5
  } else {
    maxFollowUps = 4
  }

  // Skip stage if temporal regularity is high and we have data
  // (customer is predictable → don't burn stages)
  const shouldSkipStage = hasEnoughData && temporalRegularity > 0.6 && invoice.daysOverdue <= 3

  return { nextFollowUpDays, maxFollowUps, shouldSkipStage }
}

// ============================================================
// DECISION: ESCALATION
// ============================================================

export function decideEscalation(
  input: OrchestrationInput,
): EscalationDecision {
  const { context, invoice } = input
  const disputeRisk = context.traits.disputeRisk.value
  const temporalRegularity = context.traits.temporalRegularity.value
  const ignoreCount = invoice.ignoreCount
  const amountRatio = invoice.amountRatio
  const hasEnoughData = context.observationCount >= MIN_OBSERVATIONS_FOR_BEHAVIORAL

  // Hard threshold: 4+ ignores → always escalate
  if (ignoreCount >= FORCE_ESCALATION_IGNORE) {
    return {
      shouldEscalate: true,
      reason: `Customer has ignored ${ignoreCount} consecutive reminders`,
    }
  }

  // Behavioral-aware escalation
  if (hasEnoughData) {
    // High regularity + moderate ignore count → active avoidance
    if (temporalRegularity > 0.6 && ignoreCount >= 2) {
      return {
        shouldEscalate: true,
        reason: `Customer reads regularly (regularity=${temporalRegularity.toFixed(2)}) but ignores reminders`,
      }
    }

    // Ignore threshold + high amount + dispute risk
    if (ignoreCount >= ESCALATION_IGNORE_THRESHOLD && amountRatio > ESCALATION_AMOUNT_RATIO && disputeRisk > ESCALATION_DISPUTE_THRESHOLD) {
      return {
        shouldEscalate: true,
        reason: `High value invoice (${amountRatio.toFixed(1)}x avg) ignored ${ignoreCount}x with dispute risk ${disputeRisk.toFixed(2)}`,
      }
    }
  } else {
    // Sparse data → fall back to hard thresholds
    if (ignoreCount >= ESCALATION_IGNORE_THRESHOLD && amountRatio > ESCALATION_AMOUNT_RATIO) {
      return {
        shouldEscalate: true,
        reason: `High value invoice (${amountRatio.toFixed(1)}x avg) ignored ${ignoreCount}x`,
      }
    }
  }

  return { shouldEscalate: false, reason: null }
}

// ============================================================
// MAIN ENTRY POINT
// ============================================================

export function buildRecommendation(input: OrchestrationInput): SendRecommendation {
  const { context, invoice, operatingHours } = input

  // If auto-send is disabled at tenant level, skip
  if (!operatingHours.enabled) {
    return { ...DEFAULT_SEND_RECOMMENDATION, shouldSend: false, skipReason: 'operating_hours_disabled' }
  }

  const timing = decideSendTiming(input)
  const channel = decideChannel(input)
  const content = decideContentTone(input)
  const cadence = decideCadence(input)
  const escalation = decideEscalation(input)

  // If channel is push-only and push is not viable, skip
  if (channel.priority === 'push_only' && channel.channelViability < 0.1) {
    return { ...DEFAULT_SEND_RECOMMENDATION, shouldSend: false, skipReason: 'no_viable_channel' }
  }

  return {
    shouldSend: channel.priority !== 'push_only' || channel.channelViability >= 0.1,
    skipReason: null,
    timing,
    channel,
    content,
    cadence,
    escalation,
  }
}
