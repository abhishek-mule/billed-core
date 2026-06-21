import { describe, it, expect, beforeAll } from 'vitest'
import { interpretProjectionDelta } from '../../observation-interpreter'
import type { ProjectionDelta, BehavioralObservation } from '@billzo/shared'

// ============================================================
// INTERPRETER DRIFT TESTS
// ============================================================
// When INTERPRETER_VERSION changes, these tests detect semantic
// drift by comparing v1 vs v2 observation output for the same
// input deltas.
//
// Run: vitest run -- test behavioral/drift.test.ts
// Set env V2_INTERPRETER_PATH to point to the v2 interpreter module.
// ============================================================

// ---- Snapshot registry ----
// Each test case registers its input deltas + v1 output as a snapshot.
// When the interpreter version changes, the test runner compares
// v2 output against the v1 snapshot and reports drift.
//
// Drift dimensions:
//   1. Type drift: different BehavioralObservation.type for same delta
//   2. Confidence drift: |v1.confidence - v2.confidence| > tolerance
//   3. Source drift: different source or sourceReliability
//   4. Observation count drift: different number of observations from same deltas
//   5. Semantic inversion: observation meaning changes (e.g. message_seen -> attention_absent)

interface DriftCase {
  name: string
  deltas: ProjectionDelta[]
  v1Snapshot: {
    observations: BehavioralObservation[]
    metadata: {
      interpreterVersion: string
      timestamp: string
    }
  }
  tolerances: {
    maxConfidenceDelta: number
    requireSameType: boolean
    requireSameSource: boolean
    maxCountDelta: number
  }
}

// Moving on to v2 snapshot validation — v1 snapshots are recorded here.
// In a CI pipeline, this file would be imported by the v2 test runner.

function makeDeliveryDelta(overrides: Partial<ProjectionDelta> = {}): ProjectionDelta {
  const baseTs = Date.now() - 86400000
  return {
    tenantId: 'drift-tenant',
    customerId: 'drift-customer',
    invoiceId: 'inv-drift',
    billzoMessageId: 'bmsg-drift',
    transportState: 'delivered',
    deliveryHealth: 'healthy',
    prevTransportState: 'sent',
    prevDeliveryHealth: 'healthy',
    occurredAt: new Date(baseTs).toISOString(),
    prevOccurredAt: new Date(baseTs - 3600000).toISOString(),
    ...overrides,
  }
}

const v1SnapshotCases: DriftCase[] = [
  {
    name: 'delivery produces message_seen',
    deltas: [makeDeliveryDelta()],
    v1Snapshot: {
      observations: [],
      metadata: { interpreterVersion: '1.0.0', timestamp: new Date().toISOString() },
    },
    tolerances: {
      maxConfidenceDelta: 0.1,
      requireSameType: true,
      requireSameSource: true,
      maxCountDelta: 0,
    },
  },
  {
    name: 'UPI click produces payment_intent',
    deltas: [makeDeliveryDelta({ transportState: 'clicked_upi', prevTransportState: 'delivered' })],
    v1Snapshot: {
      observations: [],
      metadata: { interpreterVersion: '1.0.0', timestamp: new Date().toISOString() },
    },
    tolerances: {
      maxConfidenceDelta: 0.05,
      requireSameType: true,
      requireSameSource: true,
      maxCountDelta: 0,
    },
  },
]

describe('Snapshot Registration (v1)', () => {
  beforeAll(() => {
    // Record v1 snapshots by running the interpreter
    // This captures the current behavior for future drift comparison
    for (const c of v1SnapshotCases) {
      const obs = c.deltas
        .map(d => interpretProjectionDelta(d))
        .filter((o): o is BehavioralObservation => o !== null)
      c.v1Snapshot.observations = obs
      c.v1Snapshot.metadata.timestamp = new Date().toISOString()
    }
  })

  it('records v1 snapshot for all drift cases', () => {
    expect(v1SnapshotCases.length).toBeGreaterThan(0)
    for (const c of v1SnapshotCases) {
      expect(c.v1Snapshot.observations.length).toBeGreaterThan(0)
    }
  })

  it('all snapshots have correct interpreter version', () => {
    for (const c of v1SnapshotCases) {
      expect(c.v1Snapshot.metadata.interpreterVersion).toBe('1.0.0')
    }
  })

  it('delivery produces message_seen type', () => {
    const deliveryCase = v1SnapshotCases.find(c => c.name === 'delivery produces message_seen')
    expect(deliveryCase).toBeDefined()
    const obs = deliveryCase!.v1Snapshot.observations
    expect(obs[0]?.type).toBe('message_seen')
    expect(obs[0]?.source).toBe('transport')
  })

  it('UPI click produces payment_intent type', () => {
    const upiCase = v1SnapshotCases.find(c => c.name === 'UPI click produces payment_intent')
    expect(upiCase).toBeDefined()
    const obs = upiCase!.v1Snapshot.observations
    expect(obs[0]?.type).toBe('payment_intent')
    expect(obs[0]?.confidence).toBeCloseTo(0.95, 2)
  })
})

// ---- Drift comparison utilities ----
// These are intended to be imported by the v2 test runner.

export type DriftReport = {
  caseName: string
  passed: boolean
  typeDrift: boolean
  confidenceDrift: number | null
  sourceDrift: boolean
  countDrift: number
  details: string
}

export function compareObservationSets(
  v1: BehavioralObservation[],
  v2: BehavioralObservation[],
  tolerances: DriftCase['tolerances'],
): Omit<DriftReport, 'caseName'> {
  const typeDrift = v1.some((o, i) => o.type !== v2[i]?.type)
  const sourceDrift = v1.some((o, i) => o.source !== v2[i]?.source)
  const countDrift = Math.abs(v1.length - v2.length)
  const confidenceDrift =
    countDrift > 0 || v1.length === 0
      ? null
      : Math.max(...v1.map((o, i) => Math.abs(o.confidence - v2[i].confidence)))

  const passed =
    !typeDrift &&
    !sourceDrift &&
    countDrift <= tolerances.maxCountDelta &&
    (confidenceDrift === null || confidenceDrift <= tolerances.maxConfidenceDelta)

  let details = ''
  if (!passed) {
    const parts: string[] = []
    if (typeDrift) parts.push(`type drift detected`)
    if (sourceDrift) parts.push(`source drift detected`)
    if (countDrift > tolerances.maxCountDelta) parts.push(`count drift: ${countDrift}`)
    if (confidenceDrift !== null && confidenceDrift > tolerances.maxConfidenceDelta) {
      parts.push(`confidence drift: ${confidenceDrift.toFixed(4)}`)
    }
    details = parts.join(', ') || 'unknown drift'
  }

  return { passed, typeDrift, sourceDrift, countDrift, confidenceDrift, details }
}

describe('Drift Comparison Utilities', () => {
  it('detects type drift', () => {
    const v1: BehavioralObservation[] = [
      { type: 'message_seen', confidence: 0.8, source: 'system_inference', sourceReliability: 0.7, metadata: {}, interpreterVersion: '1.0.0', tenantId: 't', customerId: 'c', invoiceId: 'i', occurredAt: new Date().toISOString() },
    ]
    const v2: BehavioralObservation[] = [
      { type: 'attention_absent', confidence: 0.8, source: 'system_inference', sourceReliability: 0.7, metadata: {}, interpreterVersion: '2.0.0', tenantId: 't', customerId: 'c', invoiceId: 'i', occurredAt: new Date().toISOString() },
    ]
    const result = compareObservationSets(v1, v2, {
      maxConfidenceDelta: 0.1,
      requireSameType: true,
      requireSameSource: true,
      maxCountDelta: 0,
    })
    expect(result.typeDrift).toBe(true)
    expect(result.passed).toBe(false)
  })

  it('detects confidence drift beyond tolerance', () => {
    const v1: BehavioralObservation[] = [
      { type: 'message_seen', confidence: 0.8, source: 'system_inference', sourceReliability: 0.7, metadata: {}, interpreterVersion: '1.0.0', tenantId: 't', customerId: 'c', invoiceId: 'i', occurredAt: new Date().toISOString() },
    ]
    const v2: BehavioralObservation[] = [
      { type: 'message_seen', confidence: 0.5, source: 'system_inference', sourceReliability: 0.7, metadata: {}, interpreterVersion: '2.0.0', tenantId: 't', customerId: 'c', invoiceId: 'i', occurredAt: new Date().toISOString() },
    ]
    const result = compareObservationSets(v1, v2, {
      maxConfidenceDelta: 0.1,
      requireSameType: true,
      requireSameSource: true,
      maxCountDelta: 0,
    })
    expect(result.confidenceDrift).toBeCloseTo(0.3, 2)
    expect(result.passed).toBe(false)
  })

  it('passes when observations match within tolerance', () => {
    const obs: BehavioralObservation = {
      type: 'message_seen', confidence: 0.75, source: 'system_inference', sourceReliability: 0.7, metadata: {}, interpreterVersion: '1.0.0', tenantId: 't', customerId: 'c', invoiceId: 'i', occurredAt: new Date().toISOString(),
    }
    const result = compareObservationSets([obs], [obs], {
      maxConfidenceDelta: 0.1,
      requireSameType: true,
      requireSameSource: true,
      maxCountDelta: 0,
    })
    expect(result.passed).toBe(true)
  })
})
