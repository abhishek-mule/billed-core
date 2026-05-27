import { vi, describe, it, expect } from 'vitest'

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({}) as any,
}))

import { buildSnapshot } from '../../orchestration-snapshot'
import type { BehavioralRecommendationContext, InvoiceOrchestrationState, OperatingHoursConfig } from '@billzo/shared'
import { DEFAULT_OPERATING_HOURS } from '@billzo/shared'

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

const ALL_HOURS: OperatingHoursConfig = {
  enabled: true,
  windows: [{ start: '00:00', end: '23:59' }],
  quietDays: [],
  quietAfter: '',
}

function makeInput(overrides: Record<string, any> = {}) {
  return {
    context: makeContext(),
    invoice: makeInvoice(),
    operatingHours: ALL_HOURS,
    transportConfidence: 1.0,
    ...overrides,
  }
}

describe('buildSnapshot', () => {
  it('produces valid snapshot structure', () => {
    const input = makeInput()
    const { snapshot, recommendation, traces, confidence } = buildSnapshot(input, { triggeredBy: 'test' })

    expect(snapshot.invoiceId).toBe('inv1')
    expect(snapshot.customerId).toBe('c1')
    expect(snapshot.tenantId).toBe('t1')
    expect(snapshot.policyVersion).toBeDefined()
    expect(snapshot.orchestratorVersion).toBeDefined()
    expect(snapshot.inputHash).toBeDefined()
    expect(snapshot.executedAt).toBeDefined()
    expect(snapshot.triggeredBy).toBe('test')
    expect(snapshot.recommendation.shouldSend).toBe(true)
    expect(recommendation.shouldSend).toBe(true)
    expect(traces.length).toBeGreaterThan(0)
    expect(confidence).toBeDefined()
  })

  it('includes all interpreter versions', () => {
    const { snapshot } = buildSnapshot(makeInput(), { triggeredBy: 'test' })
    const iv = snapshot.interpreterVersions
    expect(iv.entropy).toBeDefined()
    expect(iv.traits).toBeDefined()
    expect(iv.attribution).toBeDefined()
    expect(iv.calibration).toBeDefined()
    expect(iv.observation).toBeDefined()
  })

  it('inputHash is deterministic for same input', () => {
    const inp = makeInput()
    const { snapshot: s1 } = buildSnapshot(inp, { triggeredBy: 'test' })
    const { snapshot: s2 } = buildSnapshot(inp, { triggeredBy: 'test' })
    expect(s1.inputHash).toBe(s2.inputHash)
  })

  it('inputHash changes when context changes', () => {
    const inp1 = makeInput()
    const inp2 = makeInput({ context: makeContext({ observationCount: 99 }) })
    const { snapshot: s1 } = buildSnapshot(inp1, { triggeredBy: 'test' })
    const { snapshot: s2 } = buildSnapshot(inp2, { triggeredBy: 'test' })
    expect(s1.inputHash).not.toBe(s2.inputHash)
  })

  it('snapshot includes behavioral context snapshot', () => {
    const { snapshot } = buildSnapshot(makeInput(), { triggeredBy: 'test' })
    const bs = snapshot.behavioralSnapshot
    expect(bs.observationCount).toBe(15)
    expect(bs.traits.temporalRegularity.value).toBe(0.5)
    expect(bs.traits.channelViability.priorSource).toBe('customer')
    expect(bs.entropy).toBe(0.3)
    expect(bs.priorSource).toBe('customer')
  })

  it('includes rule traces for all decisions', () => {
    const { snapshot } = buildSnapshot(makeInput(), { triggeredBy: 'test' })
    const ruleIds = snapshot.ruleTraces.map(t => t.ruleId)
    expect(ruleIds.length).toBeGreaterThanOrEqual(5)
    // Should cover timing, channel, content, cadence, escalation
    expect(ruleIds.some(r => r.startsWith('timing.'))).toBe(true)
    expect(ruleIds.some(r => r.startsWith('channel.'))).toBe(true)
    expect(ruleIds.some(r => r.startsWith('content.'))).toBe(true)
    expect(ruleIds.some(r => r.startsWith('cadence.'))).toBe(true)
    expect(ruleIds.some(r => r.startsWith('escalation.'))).toBe(true)
  })

  it('includes human-readable rationale', () => {
    const { snapshot } = buildSnapshot(makeInput(), { triggeredBy: 'test' })
    expect(snapshot.rationale.length).toBeGreaterThan(0)
    for (const line of snapshot.rationale) {
      expect(typeof line).toBe('string')
      expect(line.length).toBeGreaterThan(0)
    }
  })

  it('handles operating-hours-disabled input', () => {
    const input = makeInput({
      operatingHours: { ...ALL_HOURS, enabled: false },
    })
    const { snapshot, recommendation } = buildSnapshot(input, { triggeredBy: 'test' })
    expect(recommendation.shouldSend).toBe(false)
    expect(recommendation.skipReason).toBe('operating_hours_disabled')
    expect(snapshot.recommendation.shouldSend).toBe(false)
  })

  it('handles 0-observation sparse regime', () => {
    const input = makeInput({
      context: makeContext({ observationCount: 0, priorSource: 'none' }),
    })
    const { snapshot, confidence } = buildSnapshot(input, { triggeredBy: 'test' })
    expect(confidence.timing).toBeLessThan(0.3)
    expect(snapshot.recommendation.shouldSend).toBe(true)
    expect(snapshot.behavioralSnapshot.observationCount).toBe(0)
  })
})
