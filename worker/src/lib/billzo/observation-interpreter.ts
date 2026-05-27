import type {
  BehavioralObservation,
  ObservationSource,
  ObservationType,
  ProjectionDelta,
} from '@billzo/shared'
import { INTERPRETER_VERSION } from '@billzo/shared'

// ============================================================
// OBSERVATION INTERPRETER
// ============================================================
// Converts raw transport projection deltas into behavioral observations
// with confidence scores. This is the boundary where raw telemetry
// becomes interpreted behavioral evidence.
//
// Key principles:
//   1. Observations are hypotheses, not facts — they carry confidence
//   2. Sub-2-second reads are discounted (notification preview artifact)
//   3. Duplicate same-state transitions are collapsed
//   4. Every observation carries interpreterVersion for replay determinism
// ============================================================

const SECONDS_15 = 15_000
const SECONDS_2 = 2_000

export function interpretProjectionDelta(
  delta: ProjectionDelta,
): BehavioralObservation | null {
  const transportState = delta.transportState
  const prevState = delta.prevTransportState

  if (!prevState) return null

  if (transportState === 'read') {
    return interpretRead(delta, prevState)
  }

  if (transportState === 'failed_terminal') {
    return interpretFailure(delta)
  }

  if (transportState === 'delivered' || transportState === 'received') {
    return interpretDelivered(delta, prevState)
  }

  if (transportState === 'clicked_upi') {
    return interpretUpiClick(delta)
  }

  return null
}

function interpretRead(
  delta: ProjectionDelta,
  prevState: string,
): BehavioralObservation | null {
  if (!delta.prevOccurredAt) {
    return makeObservation(
      'message_seen',
      0.5,
      'transport',
      0.5,
      delta,
      'Read detected — no previous timestamp for delta calculation',
    )
  }

  const readTime = new Date(delta.occurredAt).getTime()
  const prevTime = new Date(delta.prevOccurredAt).getTime()
  const deltaMs = readTime - prevTime

  if (deltaMs < SECONDS_2) {
    return makeObservation(
      'message_seen',
      0.2,
      'transport',
      0.3,
      delta,
      'Sub-2s read — likely notification preview or auto-open artifact',
    )
  }

  if (deltaMs < SECONDS_15) {
    return makeObservation(
      'message_seen',
      0.5,
      'transport',
      0.6,
      delta,
      'Read 2-15s after delivery — plausible human read',
    )
  }

  return makeObservation(
    'message_seen',
    0.7,
    'transport',
    0.8,
    delta,
    'Read >15s after delivery — high confidence human read',
  )
}

function interpretFailure(
  delta: ProjectionDelta,
): BehavioralObservation | null {
  return makeObservation(
    'channel_failure',
    0.85,
    'system_inference',
    0.7,
    delta,
    'Transport failure detected',
  )
}

function interpretDelivered(
  delta: ProjectionDelta,
  prevState: string,
): BehavioralObservation | null {
  if (prevState === 'sent' || prevState === 'server_ack') {
    return makeObservation(
      'message_seen',
      0.3,
      'transport',
      0.5,
      delta,
      'Message delivered to device',
    )
  }
  return null
}

function interpretUpiClick(
  delta: ProjectionDelta,
): BehavioralObservation | null {
  return makeObservation(
    'payment_intent',
    0.95,
    'transport',
    0.9,
    delta,
    'UPI link clicked — strong payment intent signal',
  )
}

function makeObservation(
  type: ObservationType,
  confidence: number,
  source: ObservationSource,
  sourceReliability: number,
  delta: ProjectionDelta,
  reason: string,
): BehavioralObservation {
  return {
    type,
    confidence,
    source,
    sourceReliability,
    interpreterVersion: INTERPRETER_VERSION,
    occurredAt: new Date().toISOString(),
    tenantId: delta.tenantId,
    customerId: delta.customerId,
    invoiceId: delta.invoiceId,
    metadata: {
      billzoMessageId: delta.billzoMessageId,
      transportState: delta.transportState,
      prevTransportState: delta.prevTransportState,
      reason,
    },
  }
}

// ============================================================
// ENGAGEMENT ABSENCE DETECTION
// ============================================================
// Called separately (not from projection delta) to detect silent
// disengagement over a time window.

export function detectEngagementAbsence(params: {
  tenantId: string
  customerId: string
  invoiceId?: string
  totalInterventionsSent: number
  totalInterventionsRead: number
  sinceHours: number
}): BehavioralObservation | null {
  const { tenantId, customerId, invoiceId, totalInterventionsSent, totalInterventionsRead, sinceHours } = params

  if (totalInterventionsSent < 2) return null

  const unreadRatio = 1 - (totalInterventionsRead / totalInterventionsSent)

  if (unreadRatio > 0.8 && totalInterventionsSent >= 3) {
    return {
      type: 'attention_absent',
      confidence: 0.9,
      source: 'system_inference',
      sourceReliability: 0.6,
      interpreterVersion: INTERPRETER_VERSION,
      occurredAt: new Date().toISOString(),
      tenantId,
      customerId,
      invoiceId,
      absenceWindowHours: sinceHours,
      metadata: {
        totalInterventionsSent,
        totalInterventionsRead,
        unreadRatio,
      },
    }
  }

  if (unreadRatio > 0.5 && totalInterventionsSent >= 2) {
    return {
      type: 'response_absent',
      confidence: 0.6,
      source: 'system_inference',
      sourceReliability: 0.5,
      interpreterVersion: INTERPRETER_VERSION,
      occurredAt: new Date().toISOString(),
      tenantId,
      customerId,
      invoiceId,
      absenceWindowHours: sinceHours,
      metadata: {
        totalInterventionsSent,
        totalInterventionsRead,
        unreadRatio,
      },
    }
  }

  return null
}
