import { describe, it, expect } from 'vitest'
import {
  buildRecommendation,
  buildRecommendationFull,
  computeDecisionConfidence,
  decideSendTiming,
  decideChannel,
  decideContentTone,
  decideCadence,
  decideEscalation,
} from '../../orchestrator'
import type { OrchestrationInput, BehavioralRecommendationContext, InvoiceOrchestrationState, OperatingHoursConfig } from '@billzo/shared'
import { DEFAULT_OPERATING_HOURS } from '@billzo/shared'

// Operating hours that cover all times for deterministic testing
const ALL_HOURS: OperatingHoursConfig = {
  enabled: true,
  windows: [{ start: '00:00', end: '23:59' }],
  quietDays: [],
  quietAfter: '',
}

function makeContext(overrides: Record<string, any> = {}): BehavioralRecommendationContext {
  const defaultTraits = {
    temporalRegularity: { value: 0.5, priorSource: 'customer' as const, evidenceWeight: 10 },
    constraintAffinity: { value: 0.3, priorSource: 'customer' as const, evidenceWeight: 10 },
    strategicDelayLikelihood: { value: 0.2, priorSource: 'customer' as const, evidenceWeight: 10 },
    disputeRisk: { value: 0.1, priorSource: 'customer' as const, evidenceWeight: 10 },
    channelViability: { value: 0.8, priorSource: 'customer' as const, evidenceWeight: 10 },
  }
  const base = {
    tenantId: 't1',
    customerId: 'c1',
    readRate: 0.6,
    channelViability: 0.8,
    entropy: 0.3,
    priorSource: 'customer' as const,
    observationCount: 15,
    updatedAt: new Date().toISOString(),
  }
  return {
    ...base,
    ...overrides,
    traits: { ...defaultTraits, ...(overrides.traits || {}) },
  }
}

function makeInvoice(overrides: Partial<InvoiceOrchestrationState> = {}): InvoiceOrchestrationState {
  return {
    id: 'inv1',
    total: 5000,
    daysOverdue: 5,
    currentStage: 't24_nudge',
    ignoreCount: 0,
    amountRatio: 1.0,
    ...overrides,
  }
}

function makeInput(overrides: Partial<OrchestrationInput> = {}): OrchestrationInput {
  return {
    context: makeContext(),
    invoice: makeInvoice(),
    operatingHours: DEFAULT_OPERATING_HOURS,
    ...overrides,
  }
}

// ============================================================
// decideSendTiming
// ============================================================

describe('decideSendTiming', () => {
  it('returns immediate=true with all-hours operating hours and sparse data', () => {
    const input = makeInput({
      context: makeContext({ observationCount: 0 }),
      operatingHours: ALL_HOURS,
    })
    const result = decideSendTiming(input)
    expect(result.immediate).toBe(true)
    expect(result.delayMinutes).toBe(0)
  })

  it('prefers preferredWindow when temporalRegularity is high', () => {
    const input = makeInput({
      context: makeContext({
        traits: {
          temporalRegularity: { value: 0.85, priorSource: 'customer', evidenceWeight: 20 },
        },
        observationCount: 20,
      }),
      operatingHours: ALL_HOURS,
    })
    const result = decideSendTiming(input)
    expect(result.preferredWindow).not.toBeNull()
    expect(result.preferredWindow!.confidence).toBeGreaterThan(0.6)
  })

  it('adds soak period when disputeRisk is high', () => {
    const input = makeInput({
      context: makeContext({
        traits: {
          disputeRisk: { value: 0.8, priorSource: 'customer', evidenceWeight: 10 },
        },
        observationCount: 15,
      }),
      operatingHours: ALL_HOURS,
    })
    const result = decideSendTiming(input)
    expect(result.delayMinutes).toBeGreaterThan(0)
    expect(result.immediate).toBe(false)
  })

  it('does not produce preferredWindow with insufficient data', () => {
    const input = makeInput({
      context: makeContext({ observationCount: 1 }),
      operatingHours: ALL_HOURS,
    })
    const result = decideSendTiming(input)
    expect(result.preferredWindow).toBeNull()
  })
})

// ============================================================
// decideChannel
// ============================================================

describe('decideChannel', () => {
  it('returns whatsapp when channelViability >= 0.6', () => {
    const input = makeInput({
      context: makeContext({
        traits: {
          channelViability: { value: 0.8, priorSource: 'customer', evidenceWeight: 10 },
        },
      }),
    })
    const result = decideChannel(input)
    expect(result.priority).toBe('whatsapp')
  })

  it('returns whatsapp_then_push when 0.3 <= channelViability < 0.6', () => {
    const input = makeInput({
      context: makeContext({
        traits: {
          channelViability: { value: 0.45, priorSource: 'customer', evidenceWeight: 10 },
        },
      }),
    })
    const result = decideChannel(input)
    expect(result.priority).toBe('whatsapp_then_push')
  })

  it('returns push_only when channelViability < 0.3', () => {
    const input = makeInput({
      context: makeContext({
        traits: {
          channelViability: { value: 0.1, priorSource: 'customer', evidenceWeight: 10 },
        },
      }),
    })
    const result = decideChannel(input)
    expect(result.priority).toBe('push_only')
  })
})

// ============================================================
// decideContentTone
// ============================================================

describe('decideContentTone', () => {
  it('returns soft when disputeRisk is high', () => {
    const input = makeInput({
      context: makeContext({
        traits: {
          disputeRisk: { value: 0.9, priorSource: 'customer', evidenceWeight: 10 },
        },
      }),
    })
    const result = decideContentTone(input)
    expect(result.tone).toBe('soft')
  })

  it('returns urgent when daysOverdue > 15 and amountRatio > 2', () => {
    const input = makeInput({
      invoice: makeInvoice({ daysOverdue: 20, amountRatio: 3.0 }),
    })
    const result = decideContentTone(input)
    expect(result.tone).toBe('urgent')
    expect(result.stage).toBe('t5_warning')
  })

  it('returns firm when strategicDelayLikelihood is high', () => {
    const input = makeInput({
      context: makeContext({
        traits: {
          strategicDelayLikelihood: { value: 0.8, priorSource: 'customer', evidenceWeight: 10 },
        },
      }),
    })
    const result = decideContentTone(input)
    expect(result.tone).toBe('firm')
  })

  it('disputeRisk overrides strategicDelay for tone selection', () => {
    const input = makeInput({
      context: makeContext({
        traits: {
          strategicDelayLikelihood: { value: 0.8, priorSource: 'customer', evidenceWeight: 10 },
          disputeRisk: { value: 0.7, priorSource: 'customer', evidenceWeight: 10 },
        },
      }),
    })
    const result = decideContentTone(input)
    expect(result.tone).toBe('soft')
  })
})

// ============================================================
// decideCadence
// ============================================================

describe('decideCadence', () => {
  it('returns default 3-day cadence with sparse data', () => {
    const input = makeInput({ context: makeContext({ observationCount: 0 }) })
    const result = decideCadence(input)
    expect(result.nextFollowUpDays).toBe(3)
    expect(result.maxFollowUps).toBe(4)
  })

  it('shortens follow-up when constraintAffinity is high', () => {
    const input = makeInput({
      context: makeContext({
        traits: {
          constraintAffinity: { value: 0.7, priorSource: 'customer', evidenceWeight: 10 },
        },
      }),
    })
    const result = decideCadence(input)
    expect(result.nextFollowUpDays).toBe(1)
  })

  it('increases maxFollowUps when strategicDelayLikelihood is high', () => {
    const input = makeInput({
      context: makeContext({
        traits: {
          strategicDelayLikelihood: { value: 0.7, priorSource: 'customer', evidenceWeight: 10 },
        },
      }),
    })
    const result = decideCadence(input)
    expect(result.maxFollowUps).toBe(6)
  })

  it('skips stage when temporalRegularity is high and daysOverdue <= 3', () => {
    const input = makeInput({
      context: makeContext({
        traits: {
          temporalRegularity: { value: 0.8, priorSource: 'customer', evidenceWeight: 20 },
        },
        observationCount: 20,
      }),
      invoice: makeInvoice({ daysOverdue: 2 }),
    })
    const result = decideCadence(input)
    expect(result.shouldSkipStage).toBe(true)
  })
})

// ============================================================
// decideEscalation
// ============================================================

describe('decideEscalation', () => {
  it('does not escalate with 0 ignores', () => {
    const input = makeInput()
    const result = decideEscalation(input)
    expect(result.shouldEscalate).toBe(false)
  })

  it('escalates at 4+ ignores regardless of other signals', () => {
    const input = makeInput({
      context: makeContext({ observationCount: 0 }),
      invoice: makeInvoice({ ignoreCount: 5, amountRatio: 0.5 }),
    })
    const result = decideEscalation(input)
    expect(result.shouldEscalate).toBe(true)
  })

  it('escalates at 2+ ignores when temporalRegularity is high', () => {
    const input = makeInput({
      context: makeContext({
        traits: {
          temporalRegularity: { value: 0.8, priorSource: 'customer', evidenceWeight: 20 },
        },
      }),
      invoice: makeInvoice({ ignoreCount: 2, amountRatio: 1.0 }),
    })
    const result = decideEscalation(input)
    expect(result.shouldEscalate).toBe(true)
    expect(result.reason).toContain('regularity')
  })

  it('escalates at ignoreCount=3 + high amount + dispute risk', () => {
    const input = makeInput({
      context: makeContext({
        traits: {
          disputeRisk: { value: 0.5, priorSource: 'customer', evidenceWeight: 10 },
        },
      }),
      invoice: makeInvoice({ ignoreCount: 3, amountRatio: 2.5 }),
    })
    const result = decideEscalation(input)
    expect(result.shouldEscalate).toBe(true)
    expect(result.reason).toContain('dispute')
  })
})

// ============================================================
// INTEGRATION: buildRecommendation
// ============================================================

describe('buildRecommendation (integration)', () => {
  it('skips send when operating hours are disabled', () => {
    const input = makeInput({
      operatingHours: { ...DEFAULT_OPERATING_HOURS, enabled: false },
    })
    const result = buildRecommendation(input)
    expect(result.shouldSend).toBe(false)
    expect(result.skipReason).toBe('operating_hours_disabled')
  })

  it('skips send when no viable channel exists', () => {
    const input = makeInput({
      context: makeContext({
        traits: {
          channelViability: { value: 0.05, priorSource: 'customer', evidenceWeight: 10 },
        },
      }),
    })
    const result = buildRecommendation(input)
    expect(result.shouldSend).toBe(false)
    expect(result.skipReason).toBe('no_viable_channel')
  })

  it('produces full recommendation for normal customer', () => {
    const input = makeInput({
      context: makeContext({
        traits: {
          constraintAffinity: { value: 0.2, priorSource: 'customer', evidenceWeight: 10 },
        },
      }),
    })
    const result = buildRecommendation(input)
    expect(result.shouldSend).toBe(true)
    expect(result.channel.priority).toBe('whatsapp')
    expect(result.content.tone).toBe('neutral')
    expect(result.escalation.shouldEscalate).toBe(false)
  })

  it('produces soft tone + escalation for high-dispute customer', () => {
    const input = makeInput({
      context: makeContext({
        traits: {
          disputeRisk: { value: 0.9, priorSource: 'customer', evidenceWeight: 10 },
        },
        observationCount: 15,
      }),
      invoice: makeInvoice({ ignoreCount: 3, amountRatio: 2.5 }),
    })
    const result = buildRecommendation(input)
    expect(result.content.tone).toBe('soft')
    expect(result.escalation.shouldEscalate).toBe(true)
  })

  it('no_viable_channel overrides other decisions', () => {
    const input = makeInput({
      context: makeContext({
        traits: {
          channelViability: { value: 0.05, priorSource: 'customer', evidenceWeight: 10 },
        },
      }),
      invoice: makeInvoice({ ignoreCount: 5 }),
    })
    const result = buildRecommendation(input)
    expect(result.shouldSend).toBe(false)
    expect(result.skipReason).toBe('no_viable_channel')
  })

  it('default recommendation for 0-observation customer', () => {
    const input = makeInput({
      context: makeContext({ observationCount: 0 }),
      operatingHours: ALL_HOURS,
    })
    const result = buildRecommendation(input)
    expect(result.shouldSend).toBe(true)
    expect(result.content.tone).toBe('neutral')
    expect(result.cadence.nextFollowUpDays).toBe(3)
  })
})

// ============================================================
// computeDecisionConfidence
// ============================================================

describe('computeDecisionConfidence', () => {
  it('returns high confidence with many observations and customer prior', () => {
    const ctx = makeContext({ observationCount: 50, priorSource: 'customer' })
    const conf = computeDecisionConfidence(ctx, 1.0)
    expect(conf.timing).toBeGreaterThan(0.5)
    expect(conf.channel).toBeGreaterThan(0.5)
    expect(conf.cadence).toBeGreaterThan(0.5)
    expect(conf.escalation).toBeGreaterThan(0.5)
  })

  it('returns low confidence with no observations and none prior', () => {
    const ctx = makeContext({ observationCount: 0, priorSource: 'none' })
    const conf = computeDecisionConfidence(ctx, 0.5)
    expect(conf.timing).toBeLessThan(0.3)
    expect(conf.channel).toBeLessThan(0.3)
    expect(conf.cadence).toBeLessThan(0.3)
    expect(conf.escalation).toBeLessThan(0.3)
  })

  it('transport confidence dampens all sub-confidences', () => {
    const baseCtx = makeContext({ observationCount: 50, priorSource: 'customer' })
    const highTc = computeDecisionConfidence(baseCtx, 1.0)
    const lowTc = computeDecisionConfidence(baseCtx, 0.1)
    expect(lowTc.timing).toBeLessThan(highTc.timing)
    expect(lowTc.channel).toBeLessThan(highTc.channel)
    expect(lowTc.cadence).toBeLessThan(highTc.cadence)
    expect(lowTc.escalation).toBeLessThan(highTc.escalation)
  })

  it('transport field equals the passed transportConfidence', () => {
    const ctx = makeContext({ observationCount: 10 })
    const conf = computeDecisionConfidence(ctx, 0.75)
    expect(conf.transport).toBe(0.75)
  })

  it('handles entropy=1 (max uncertainty) gracefully', () => {
    const ctx = makeContext({ observationCount: 30, priorSource: 'customer', entropy: 1.0 })
    const conf = computeDecisionConfidence(ctx, 1.0)
    expect(conf.timing).toBe(0)
    expect(conf.channel).toBeGreaterThan(0)
    expect(conf.cadence).toBeGreaterThan(0)
    expect(conf.escalation).toBeGreaterThan(0)
  })

  it('priorSource hierarchy affects timing confidence', () => {
    const baseCtx = makeContext({ observationCount: 10 })
    const customerConf = computeDecisionConfidence({ ...baseCtx, priorSource: 'customer' }, 1.0)
    const globalConf = computeDecisionConfidence({ ...baseCtx, priorSource: 'global' }, 1.0)
    expect(customerConf.timing).toBeGreaterThan(globalConf.timing)
  })
})
