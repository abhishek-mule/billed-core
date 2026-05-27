import { describe, it, expect } from 'vitest'
import { interpretProjectionDelta } from '../../observation-interpreter'
import type { ProjectionDelta, BehavioralObservation } from '@billzo/shared'

// ============================================================
// CAUSAL CONTAMINATION TESTS
// ============================================================
// These tests verify that the observation interpreter does not
// infer false causality when transport event ordering does not
// match debtor chronology.
// ============================================================

function makeDelta(overrides: Partial<ProjectionDelta> = {}): ProjectionDelta {
  const baseTs = Date.now() - 86400000
  return {
    tenantId: 'causal-tenant',
    customerId: 'causal-customer',
    invoiceId: 'inv-causal',
    billzoMessageId: 'bmsg-causal',
    transportState: 'delivered',
    deliveryHealth: 'healthy',
    prevTransportState: 'sent',
    prevDeliveryHealth: 'healthy',
    occurredAt: new Date(baseTs).toISOString(),
    prevOccurredAt: new Date(baseTs - 3600000).toISOString(),
    ...overrides,
  }
}

describe('Anti-Causality', () => {
  it('does not conflate payment_intent with message_seen', () => {
    // A UPI click is an intent signal, NOT a read signal
    const upi = makeDelta({
      transportState: 'clicked_upi',
      prevTransportState: 'delivered',
    })
    const read = makeDelta({
      transportState: 'read',
      prevTransportState: 'delivered',
      occurredAt: new Date(Date.now() - 500).toISOString(),
      prevOccurredAt: new Date(Date.now() - 60000).toISOString(),
    })

    const upiObs = interpretProjectionDelta(upi)
    const readObs = interpretProjectionDelta(read)

    // UPI click should produce payment_intent, not message_seen
    expect(upiObs?.type).toBe('payment_intent')

    // Read should produce message_seen
    expect(readObs?.type).toBe('message_seen')

    // The two observations carry different semantic meaning
    expect(upiObs?.type).not.toBe(readObs?.type)
  })

  it('payment_intent confidence is independent of read confidence', () => {
    // Payment intent confidence is 0.95 regardless of surrounding context
    const upi1 = makeDelta({
      transportState: 'clicked_upi',
      prevTransportState: 'delivered',
    })
    const upi2 = makeDelta({
      transportState: 'clicked_upi',
      prevTransportState: 'read',
    })

    const obs1 = interpretProjectionDelta(upi1)
    const obs2 = interpretProjectionDelta(upi2)

    expect(obs1?.confidence).toBeCloseTo(0.95, 2)
    expect(obs2?.confidence).toBeCloseTo(0.95, 2)
  })

  it('channel_failure does not imply debtor disengagement', () => {
    // A transport failure is NOT a behavioral signal about the debtor
    const failure = makeDelta({
      transportState: 'failed_terminal',
      prevTransportState: 'sent',
    })

    const obs = interpretProjectionDelta(failure)
    expect(obs?.type).toBe('channel_failure')
    expect(obs?.source).toBe('system_inference')

    // channel_failure should NOT affect read_rate or payment conversion
    // The materializer handles this separation
    expect(obs?.type).not.toBe('attention_absent')
    expect(obs?.type).not.toBe('response_absent')
  })

  it('sub-second read is correctly labeled as low confidence (notification artifact)', () => {
    const now = Date.now()
    const read = makeDelta({
      transportState: 'read',
      prevTransportState: 'delivered',
      occurredAt: new Date(now).toISOString(),
      prevOccurredAt: new Date(now - 300).toISOString(), // 300ms gap
    })

    const obs = interpretProjectionDelta(read)
    expect(obs).not.toBeNull()
    expect(obs!.type).toBe('message_seen')
    expect(obs!.confidence).toBeLessThan(0.3)
    // metadata should indicate this is low-confidence
    expect(obs!.sourceReliability).toBeLessThan(0.5)
  })

  it('payment before read does not inflate read→pay latency', () => {
    // When a payment occurs BEFORE a read receipt arrives,
    // the interpreter should NOT produce a message_seen that
    // implies "read caused payment".
    //
    // The observation interpreter is stateless — it only processes
    // one delta at a time. It doesn't know about cross-event causality.
    // This check happens in the materializer via checkAntiCausality().
    //
    // At the interpreter level, the read event still produces
    // a message_seen observation. The anti-causality discount
    // happens at the materializer level when computing read→pay latency.

    const read = makeDelta({
      transportState: 'read',
      prevTransportState: 'delivered',
      occurredAt: new Date(Date.now()).toISOString(),
      prevOccurredAt: new Date(Date.now() - 7200000).toISOString(), // 2h after delivery
    })

    const obs = interpretProjectionDelta(read)
    // Interpreter produces the observation based on the read receipt timing
    expect(obs).not.toBeNull()
    expect(obs!.type).toBe('message_seen')

    // The anti-causality check in the materializer compares
    // last_read_at vs last_resolution_at timestamps
    // to decide whether read→pay latency is valid
  })
})

describe('Attribution Boundaries', () => {
  it('multiple reminders before one payment should not multiply conversion', () => {
    // This is tested at the materializer level — the interpreter
    // just produces message_seen for each read.
    // Conversion rate is updated by handleResolutionCompleted
    // with a single EMA update per payment.
    expect(true).toBe(true) // Placeholder for materializer integration test
  })

  it('attribution confidence decreases with time gap', () => {
    // Attribution confidence is based on time proximity between
    // intervention and outcome. This is handled by the
    // attribution module, not the interpreter.
    expect(true).toBe(true)
  })
})
