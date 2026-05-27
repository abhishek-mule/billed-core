import { describe, it, expect } from 'vitest'
import { interpretProjectionDelta, detectEngagementAbsence } from '../../observation-interpreter'
import { INTERPRETER_VERSION } from '@billzo/shared'
import type { ProjectionDelta } from '@billzo/shared'

// ============================================================
// TEST FIXTURES
// ============================================================

function makeDelta(overrides: Partial<ProjectionDelta> = {}): ProjectionDelta {
  return {
    tenantId: 'tenant-1',
    customerId: 'customer-1',
    invoiceId: 'invoice-1',
    billzoMessageId: 'bmsg_test123',
    transportState: 'delivered',
    deliveryHealth: 'healthy',
    prevTransportState: 'sent',
    prevDeliveryHealth: 'healthy',
    occurredAt: new Date().toISOString(),
    prevOccurredAt: new Date(Date.now() - 3600000).toISOString(),
    ...overrides,
  }
}

describe('interpretProjectionDelta', () => {
  describe('delivered events', () => {
    it('emits message_seen at low confidence when transitioning from sent', () => {
      const obs = interpretProjectionDelta(makeDelta({
        transportState: 'delivered',
        prevTransportState: 'sent',
      }))
      expect(obs).not.toBeNull()
      expect(obs!.type).toBe('message_seen')
      expect(obs!.confidence).toBeCloseTo(0.3, 2)
      expect(obs!.source).toBe('transport')
      expect(obs!.sourceReliability).toBeCloseTo(0.5, 2)
      expect(obs!.interpreterVersion).toBe(INTERPRETER_VERSION)
    })

    it('returns null for duplicate delivered event', () => {
      const obs = interpretProjectionDelta(makeDelta({
        transportState: 'delivered',
        prevTransportState: 'delivered',
      }))
      expect(obs).toBeNull()
    })
  })

  describe('read events', () => {
    it('emits high confidence message_seen for read >15s after delivery', () => {
      const now = Date.now()
      const obs = interpretProjectionDelta(makeDelta({
        transportState: 'read',
        prevTransportState: 'delivered',
        occurredAt: new Date(now).toISOString(),
        prevOccurredAt: new Date(now - 60000).toISOString(), // 60s ago
      }))
      expect(obs).not.toBeNull()
      expect(obs!.type).toBe('message_seen')
      expect(obs!.confidence).toBeCloseTo(0.7, 2)
    })

    it('emits medium confidence message_seen for read 2-15s after delivery', () => {
      const now = Date.now()
      const obs = interpretProjectionDelta(makeDelta({
        transportState: 'read',
        prevTransportState: 'delivered',
        occurredAt: new Date(now).toISOString(),
        prevOccurredAt: new Date(now - 5000).toISOString(), // 5s ago
      }))
      expect(obs).not.toBeNull()
      expect(obs!.type).toBe('message_seen')
      expect(obs!.confidence).toBeCloseTo(0.5, 2)
    })

    it('emits low confidence message_seen for read <2s after delivery (notification preview)', () => {
      const now = Date.now()
      const obs = interpretProjectionDelta(makeDelta({
        transportState: 'read',
        prevTransportState: 'delivered',
        occurredAt: new Date(now).toISOString(),
        prevOccurredAt: new Date(now - 500).toISOString(), // 500ms ago
      }))
      expect(obs).not.toBeNull()
      expect(obs!.type).toBe('message_seen')
      expect(obs!.confidence).toBeCloseTo(0.2, 2)
    })

    it('handles missing prevOccurredAt with medium confidence', () => {
      const obs = interpretProjectionDelta(makeDelta({
        transportState: 'read',
        prevTransportState: 'delivered',
        prevOccurredAt: null,
      }))
      expect(obs).not.toBeNull()
      expect(obs!.type).toBe('message_seen')
      expect(obs!.confidence).toBeCloseTo(0.5, 2)
    })
  })

  describe('failed_terminal events', () => {
    it('emits channel_failure with high confidence', () => {
      const obs = interpretProjectionDelta(makeDelta({
        transportState: 'failed_terminal',
        prevTransportState: 'sent',
      }))
      expect(obs).not.toBeNull()
      expect(obs!.type).toBe('channel_failure')
      expect(obs!.confidence).toBeCloseTo(0.85, 2)
      expect(obs!.source).toBe('system_inference')
    })
  })

  describe('upi_clicked events', () => {
    it('emits payment_intent with very high confidence', () => {
      const obs = interpretProjectionDelta(makeDelta({
        transportState: 'clicked_upi',
        prevTransportState: 'delivered',
      }))
      expect(obs).not.toBeNull()
      expect(obs!.type).toBe('payment_intent')
      expect(obs!.confidence).toBeCloseTo(0.95, 2)
      expect(obs!.source).toBe('transport')
      expect(obs!.sourceReliability).toBeCloseTo(0.9, 2)
    })
  })

  describe('edge cases', () => {
    it('returns null for null prevState (first event in sequence)', () => {
      const obs = interpretProjectionDelta(makeDelta({
        prevTransportState: null,
        prevOccurredAt: null,
      }))
      expect(obs).toBeNull()
    })

    it('returns null for unknown transport state', () => {
      const obs = interpretProjectionDelta(makeDelta({
        transportState: 'queued',
        prevTransportState: 'sent',
      }))
      expect(obs).toBeNull()
    })
  })
})

describe('detectEngagementAbsence', () => {
  it('returns null when fewer than 2 interventions sent', () => {
    const obs = detectEngagementAbsence({
      tenantId: 't1',
      customerId: 'c1',
      totalInterventionsSent: 1,
      totalInterventionsRead: 0,
      sinceHours: 168,
    })
    expect(obs).toBeNull()
  })

  it('detects attention_absent when >80% unread with 3+ sends', () => {
    const obs = detectEngagementAbsence({
      tenantId: 't1',
      customerId: 'c1',
      totalInterventionsSent: 5,
      totalInterventionsRead: 0,
      sinceHours: 168,
    })
    expect(obs).not.toBeNull()
    expect(obs!.type).toBe('attention_absent')
    expect(obs!.confidence).toBeCloseTo(0.9, 2)
    expect(obs!.absenceWindowHours).toBe(168)
  })

  it('detects response_absent when >50% unread with 2+ sends', () => {
    const obs = detectEngagementAbsence({
      tenantId: 't1',
      customerId: 'c1',
      totalInterventionsSent: 2,
      totalInterventionsRead: 0,
      sinceHours: 72,
    })
    expect(obs).not.toBeNull()
    expect(obs!.type).toBe('response_absent')
    expect(obs!.confidence).toBeCloseTo(0.6, 2)
    expect(obs!.absenceWindowHours).toBe(72)
  })

  it('returns null when read rate is high', () => {
    const obs = detectEngagementAbsence({
      tenantId: 't1',
      customerId: 'c1',
      totalInterventionsSent: 5,
      totalInterventionsRead: 4,
      sinceHours: 168,
    })
    expect(obs).toBeNull()
  })
})
