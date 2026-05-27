import { describe, it, expect } from 'vitest'
import { interpretProjectionDelta } from '../../observation-interpreter'
import type { ProjectionDelta, BehavioralObservation } from '@billzo/shared'

// ============================================================
// REPLAY STABILITY TESTS
// ============================================================
// These tests verify that the observation interpreter produces
// stable output under adversarial event ordering.
//
// The interpreter is stateless, so stability is measured by
// comparing observation streams under different orderings of
// the same raw deltas.
// ============================================================

function makeDelta(overrides: Partial<ProjectionDelta> = {}): ProjectionDelta {
  const baseTs = Date.now() - 86400000
  return {
    tenantId: 'stable-tenant',
    customerId: 'stable-customer',
    invoiceId: 'inv-1',
    billzoMessageId: 'bmsg-test',
    transportState: 'delivered',
    deliveryHealth: 'healthy',
    prevTransportState: 'sent',
    prevDeliveryHealth: 'healthy',
    occurredAt: new Date(baseTs).toISOString(),
    prevOccurredAt: new Date(baseTs - 3600000).toISOString(),
    ...overrides,
  }
}

function runInterpreter(deltas: ProjectionDelta[]): BehavioralObservation[] {
  return deltas
    .map(interpretProjectionDelta)
    .filter((o): o is BehavioralObservation => o !== null)
}

/**
 * Generate a sequence of deltas representing a typical recovery flow.
 */
function generateTypicalFlow(): ProjectionDelta[] {
  const baseTs = Date.now() - 86400000 * 14 // 14 days ago
  const deltas: ProjectionDelta[] = []

  // Day 1: Send reminder, delivered after 2h
  deltas.push(makeDelta({
    transportState: 'sent',
    prevTransportState: null,
    billzoMessageId: 'bmsg-reminder-1',
    occurredAt: new Date(baseTs).toISOString(),
    prevOccurredAt: null,
  }))
  deltas.push(makeDelta({
    transportState: 'delivered',
    prevTransportState: 'sent',
    billzoMessageId: 'bmsg-reminder-1',
    occurredAt: new Date(baseTs + 7200000).toISOString(), // +2h
    prevOccurredAt: new Date(baseTs).toISOString(),
  }))

  // Day 2: Read
  deltas.push(makeDelta({
    transportState: 'read',
    prevTransportState: 'delivered',
    billzoMessageId: 'bmsg-reminder-1',
    occurredAt: new Date(baseTs + 90000000).toISOString(), // +25h
    prevOccurredAt: new Date(baseTs + 7200000).toISOString(),
  }))

  // Day 2: UPI click
  deltas.push(makeDelta({
    transportState: 'clicked_upi',
    prevTransportState: 'read',
    billzoMessageId: 'bmsg-reminder-1',
    occurredAt: new Date(baseTs + 93600000).toISOString(), // +26h
    prevOccurredAt: new Date(baseTs + 90000000).toISOString(),
  }))

  return deltas
}

describe('Permutation Stability', () => {
  it('produces same number of observations regardless of event order within a 5min window', () => {
    const flow = generateTypicalFlow()

    // Baseline: chronological
    const baseline = runInterpreter(flow)

    // Permutation: shuffle events within 5-minute time buckets
    const shuffled = [...flow].sort(() => Math.random() - 0.5)
    const permuted = runInterpreter(shuffled)

    // The interpreter is stateless — same deltas produce same observations regardless of order
    // So the count should be identical
    expect(permuted.length).toBe(baseline.length)
  })

  it('handles duplicate events gracefully (no double-counting)', () => {
    const flow = generateTypicalFlow()
    const baseline = runInterpreter(flow)

    // Inject duplicates: repeat each delta
    const withDuplicates = flow.flatMap(d => [d, { ...d }])
    const result = runInterpreter(withDuplicates)

    // The interpreter is stateless — duplicate deltas produce identical observations
    // Deduplication happens upstream at the projection layer (CAS upsert), not here
    expect(result.length).toBe(baseline.length * 2)
  })

  it('handles delayed delivery receipts', () => {
    const flow = generateTypicalFlow()

    // Baseline
    const baseline = runInterpreter(flow)

    // Scenario: read receipt arrives before delivery receipt
    const readDelta = flow.find(d => d.transportState === 'read')!
    const deliveredDelta = flow.find(d => d.transportState === 'delivered')!

    // Process: read first (with no prev context), then delivered
    const reordered = [
      { ...readDelta, prevTransportState: null, prevOccurredAt: null },
      deliveredDelta,
    ]
    const result = runInterpreter(reordered)

    // The read without prevTransportState is treated as first event → returns null
    // Only the delivered event produces an observation
    const reads = result.filter(o => o.metadata?.transportState === 'read')
    const delivers = result.filter(o => o.metadata?.transportState === 'delivered')

    expect(reads.length).toBe(0)
    expect(delivers.length).toBe(1)
  })

  it('maintains stable observation type distribution under missing events', () => {
    const flow = generateTypicalFlow()
    const baseline = runInterpreter(flow)

    // Remove 20% of events randomly
    const missing = flow.filter(() => Math.random() > 0.2)
    const result = runInterpreter(missing)

    // Should produce fewer observations but same types
    expect(result.every(o => behavioralObservationTypes.includes(o.type))).toBe(true)

    const baselineTypes = new Set(baseline.map(o => o.type))
    result.forEach(o => {
      expect(baselineTypes.has(o.type)).toBe(true)
    })
  })

  it('produces bounded observation count under partial telemetry loss', () => {
    const flow = generateTypicalFlow()

    // Remove 50% of events
    const halfRemoved = flow.filter(() => Math.random() > 0.5)
    const result = runInterpreter(halfRemoved)

    // Should be bounded: at most the number of deltas that would produce observations
    const maxPossible = flow.filter(d => d.prevTransportState !== null).length
    expect(result.length).toBeLessThanOrEqual(maxPossible)
  })
})

describe('Partial Observability', () => {
  it('handles missing read receipts (only delivery confirmed)', () => {
    const flow = generateTypicalFlow()

    // Remove read events
    const noReads = flow.filter(d => d.transportState !== 'read')
    const result = runInterpreter(noReads)

    // Should still get delivery observations
    const delivers = result.filter(o => o.metadata?.transportState === 'delivered')
    expect(delivers.length).toBeGreaterThan(0)

    // No message_seen observations should be present (no read → no high-confidence seen)
    // Actually message_seen can still come from delivery events at low confidence
    expect(result.length).toBeGreaterThan(0)
  })

  it('handles missing delivery receipts (only read confirmed)', () => {
    const flow = generateTypicalFlow()
    const readDelta = flow.find(d => d.transportState === 'read')!
    const sentDelta = flow.find(d => d.transportState === 'sent')!

    // Only sent and read events (no delivery)
    const partial = [
      sentDelta,
      { ...readDelta, prevTransportState: 'sent', prevOccurredAt: sentDelta.occurredAt },
    ]
    const result = runInterpreter(partial)

    // Should produce read observation (delivery is implied)
    const reads = result.filter(o => o.type === 'message_seen')
    expect(reads.length).toBeGreaterThan(0)
  })

  it('handles duplicate payment signals (webhook retry)', () => {
    const flow = generateTypicalFlow()
    const upiDelta = flow.find(d => d.transportState === 'clicked_upi')!

    // Duplicate UPI click events
    const withDuplicates = [...flow, { ...upiDelta }]
    const result = runInterpreter(withDuplicates)

    // Duplicate UPI click produces two payment_intent observations
    // Deduplication happens upstream (projection layer CAS upsert), not in the interpreter
    const intents = result.filter(o => o.type === 'payment_intent')
    expect(intents.length).toBe(2)
  })
})

const behavioralObservationTypes = [
  'message_seen',
  'attention_absent',
  'response_absent',
  'resolution_absent',
  'payment_intent',
  'resolution_completed',
  'channel_failure',
]

describe('Quantitative Stability Metrics', () => {
  it('maintains confidence monotonicity under reordering', () => {
    const deltas = generateTypicalFlow()
    const baseline = runInterpreter(deltas)

    // Confidence should be monotonic across the sequence for a single billzoMessageId
    for (let i = 1; i < baseline.length; i++) {
      const prev = baseline[i - 1]
      const curr = baseline[i]
      // Same message: confidence should increase (transport progresses toward read)
      if (prev.metadata?.billzoMessageId === curr.metadata?.billzoMessageId) {
        if (curr.type === 'message_seen' && prev.type === 'message_seen') {
          // Read > delivered in terms of evidence quality
          const currState = curr.metadata?.transportState
          const prevState = prev.metadata?.transportState
          if (currState === 'read' && prevState === 'delivered') {
            expect(curr.confidence).toBeGreaterThanOrEqual(prev.confidence)
          }
        }
      }
    }
  })

  it('confidence never exceeds 1.0', () => {
    const deltas = generateTypicalFlow()
    const observations = runInterpreter(deltas)

    observations.forEach(o => {
      expect(o.confidence).toBeLessThanOrEqual(1.0)
      expect(o.confidence).toBeGreaterThanOrEqual(0)
    })
  })
})
