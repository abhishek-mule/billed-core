import { describe, it, expect, vi, beforeEach } from 'vitest'
import { correlate } from '../correlation'
import { cluster, setCustomerNameCache } from '../clusterer'
import { prioritize } from '../prioritizer'
import { synthesize } from '../synthesizer'
import { renderPaymentAnomalyTemplate } from '../templates/paymentAnomaly'
import { renderCommunicationFailureTemplate } from '../templates/communicationFailure'
import type { AttentionItem, NarrativeSeed } from '../types'

vi.mock('../../billzo/supabase-admin', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          in: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({ data: { attention_weights: {} }, error: null }),
            limit: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: null, error: null }) })),
          })),
          limit: vi.fn(() => []),
        })),
        lte: vi.fn(() => Promise.resolve({ data: [], error: null })),
      })),
      update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    })),
  },
}))

function makeItem(overrides: Partial<AttentionItem>): AttentionItem {
  return {
    id: crypto.randomUUID(),
    tenantId: 't1',
    situationId: null,
    intentType: 'overdue_risk',
    entityType: 'invoice',
    entityId: 'inv-1',
    priorityScore: 25,
    urgency: 'high',
    confidence: 0.85,
    signalData: {
      customer_id: 'c1',
      customer_name: 'Test Customer',
      total: 50000,
      days_overdue: 10,
      recovery_stage: 't24_nudge',
      stage_score: 2,
      delay_likelihood: 0.3,
    },
    correlationKey: 'cashflow:t1:c1',
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('correlation', () => {
  it('groups items by correlationKey', () => {
    const items = [
      makeItem({ id: 'a1', entityId: 'inv-1' }),
      makeItem({ id: 'a2', entityId: 'inv-2' }),
    ]
    const groups = correlate(items)
    expect(groups.size).toBe(1)
    expect(groups.get('cashflow:t1:c1')?.attentionIds).toHaveLength(2)
  })

  it('separates items with different correlationKeys', () => {
    const items = [
      makeItem({ id: 'a1', correlationKey: 'cashflow:t1:c1' }),
      makeItem({ id: 'a2', correlationKey: 'cashflow:t1:c2' }),
    ]
    const groups = correlate(items)
    expect(groups.size).toBe(2)
  })

  it('tracks totalAmount across grouped items', () => {
    const items = [
      makeItem({ id: 'a1', signalData: { total: 30000, customer_id: 'c1' } }),
      makeItem({ id: 'a2', signalData: { total: 20000, customer_id: 'c1' } }),
    ]
    const groups = correlate(items as any)
    expect(groups.get('cashflow:t1:c1')?.signals.totalAmount).toBe(50000)
  })
})

describe('clusterer', () => {
  beforeEach(() => {
    setCustomerNameCache({ c1: 'Acme Corp', c2: 'Beta Inc' })
  })

  it('creates a cashflow_cluster candidate from correlation group', () => {
    const items = [makeItem({ id: 'a1' }), makeItem({ id: 'a2' })]
    const groups = correlate(items)
    const candidates = cluster(groups)
    expect(candidates).toHaveLength(1)
    expect(candidates[0].situationType).toBe('cashflow_cluster')
    expect(candidates[0].narrativeSeed.customerName).toBe('Acme Corp')
  })

  it('computes priority score from amount and urgency', () => {
    const criticalItem = makeItem({ priorityScore: 45, urgency: 'critical', signalData: { total: 100000, customer_id: 'c1', stage_score: 4 } })
    const groups = correlate([criticalItem])
    const candidates = cluster(groups)
    expect(candidates[0].priorityScore).toBeGreaterThan(0)
  })
})

describe('prioritizer', () => {
  it('limits output to MAX_ACTIVE_SITUATIONS', () => {
    const items = Array.from({ length: 10 }, (_, i) =>
      makeItem({ id: `a${i}`, correlationKey: `cashflow:t1:c${i}` }),
    )
    const groups = correlate(items)
    const candidates = cluster(groups)
    const result = prioritize(candidates)
    expect(result.length).toBeLessThanOrEqual(7)
  })

  it('sorts by priority score descending', () => {
    const items = [
      makeItem({ id: 'a1', priorityScore: 10, correlationKey: 'cashflow:t1:c1' }),
      makeItem({ id: 'a2', priorityScore: 50, correlationKey: 'cashflow:t1:c2' }),
      makeItem({ id: 'a3', priorityScore: 30, correlationKey: 'cashflow:t1:c3' }),
    ]
    const groups = correlate(items)
    const candidates = cluster(groups)
    const result = prioritize(candidates)
    expect(result[0].priorityScore).toBeGreaterThanOrEqual(result[1].priorityScore)
    expect(result[1].priorityScore).toBeGreaterThanOrEqual(result[2].priorityScore)
  })
})

describe('synthesizer', () => {
  it('generates headline and narrative from candidate', () => {
    const items = [
      makeItem({
        id: 'a1',
        urgency: 'critical',
        priorityScore: 45,
        signalData: { total: 84000, customer_id: 'c1', customer_name: 'Gupta Electronics', days_overdue: 15, stage_score: 3, delay_likelihood: 0.4 },
      }),
    ]
    setCustomerNameCache({ c1: 'Gupta Electronics' })
    const groups = correlate(items)
    const candidates = cluster(groups)
    const prioritized = prioritize(candidates)
    const situations = synthesize(prioritized, 't1')
    expect(situations).toHaveLength(1)
    expect(situations[0].headline).toContain('Gupta Electronics')
    expect(situations[0].recommendedAction.type).toBe('send_reminder')
  })

  it('generates escalate action for critical stage', () => {
    const items = [
      makeItem({
        id: 'a1',
        urgency: 'critical',
        priorityScore: 60,
        signalData: { total: 120000, customer_id: 'c1', stage_score: 4, delay_likelihood: 0.5 },
      }),
    ]
    setCustomerNameCache({ c1: 'Sharma Traders' })
    const groups = correlate(items)
    const candidates = cluster(groups)
    const prioritized = prioritize(candidates)
    const situations = synthesize(prioritized, 't1')
    expect(situations[0].recommendedAction.type).toBe('escalate')
  })

  it('generates wait action when delay likelihood is high', () => {
    const items = [
      makeItem({
        id: 'a1',
        urgency: 'high',
        priorityScore: 30,
        signalData: { total: 25000, customer_id: 'c1', stage_score: 1, delay_likelihood: 0.8 },
      }),
    ]
    setCustomerNameCache({ c1: 'Slow Payer' })
    const groups = correlate(items)
    const candidates = cluster(groups)
    const prioritized = prioritize(candidates)
    const situations = synthesize(prioritized, 't1')
    expect(situations[0].recommendedAction.type).toBe('wait')
  })

  it('routes payment_anomaly type through synthesizer', () => {
    const items: AttentionItem[] = [
      {
        id: 'pa-1',
        tenantId: 't1',
        situationId: null,
        intentType: 'payment_anomaly',
        entityType: 'invoice',
        entityId: 'inv-1',
        priorityScore: 20,
        urgency: 'medium',
        confidence: 0.7,
        signalData: {
          customer_id: 'c1',
          customer_name: 'Partial Payer',
          total: 50000,
          paid_amount: 10000,
          outstanding: 40000,
          anomaly_type: 'stale_partial',
        },
        correlationKey: 'payment_anomaly:t1:c1',
        createdAt: new Date().toISOString(),
      },
    ]
    setCustomerNameCache({ c1: 'Partial Payer' })
    const groups = correlate(items)
    const candidates = cluster(groups)
    const prioritized = prioritize(candidates)
    const situations = synthesize(prioritized, 't1')
    expect(situations).toHaveLength(1)
    expect(situations[0].situationType).toBe('payment_anomaly')
    expect(situations[0].headline).toContain('Partial Payer')
    expect(situations[0].recommendedAction.type).toBe('send_reminder')
  })

  it('routes communication_failure type through synthesizer', () => {
    const items: AttentionItem[] = [
      {
        id: 'cf-1',
        tenantId: 't1',
        situationId: null,
        intentType: 'communication_failure',
        entityType: 'invoice',
        entityId: 'inv-2',
        priorityScore: 30,
        urgency: 'high',
        confidence: 0.8,
        signalData: {
          customer_id: 'c1',
          customer_name: 'Silent Customer',
          failure_count: 4,
          anomaly_type: 'delivery_failure',
        },
        correlationKey: 'communication_failure:t1:c1',
        createdAt: new Date().toISOString(),
      },
    ]
    setCustomerNameCache({ c1: 'Silent Customer' })
    const groups = correlate(items)
    const candidates = cluster(groups)
    const prioritized = prioritize(candidates)
    const situations = synthesize(prioritized, 't1')
    expect(situations).toHaveLength(1)
    expect(situations[0].situationType).toBe('communication_failure')
    expect(situations[0].headline).toContain('Silent Customer')
    expect(situations[0].recommendedAction.type).toBe('monitor')
  })

  it('generates call action for critical communication failure', () => {
    const items: AttentionItem[] = [
      {
        id: 'cf-2',
        tenantId: 't1',
        situationId: null,
        intentType: 'communication_failure',
        entityType: 'invoice',
        entityId: 'inv-3',
        priorityScore: 40,
        urgency: 'critical',
        confidence: 0.9,
        signalData: {
          customer_id: 'c1',
          customer_name: 'Dead Channel',
          failure_count: 6,
          anomaly_type: 'delivery_failure',
        },
        correlationKey: 'communication_failure:t1:c1',
        createdAt: new Date().toISOString(),
      },
    ]
    setCustomerNameCache({ c1: 'Dead Channel' })
    const groups = correlate(items)
    const candidates = cluster(groups)
    const prioritized = prioritize(candidates)
    const situations = synthesize(prioritized, 't1')
    expect(situations[0].recommendedAction.type).toBe('call')
    expect(situations[0].headline).toContain('Dead Channel')
  })

  it('generates review action for orphan payment anomaly', () => {
    const items: AttentionItem[] = [
      {
        id: 'pa-2',
        tenantId: 't1',
        situationId: null,
        intentType: 'payment_anomaly',
        entityType: 'payment',
        entityId: 'pmt-1',
        priorityScore: 15,
        urgency: 'medium',
        confidence: 0.5,
        signalData: {
          payment_id: 'pmt-1',
          amount: 25000,
          total: 25000,
          anomaly_type: 'orphan_payment',
        },
        correlationKey: 'payment_anomaly:t1:orphan',
        createdAt: new Date().toISOString(),
      },
    ]
    setCustomerNameCache({})
    const groups = correlate(items)
    const candidates = cluster(groups)
    const prioritized = prioritize(candidates)
    const situations = synthesize(prioritized, 't1')
    expect(situations).toHaveLength(1)
    expect(situations[0].recommendedAction.type).toBe('review')
    expect(situations[0].headline).toContain('Unidentified')
  })
})

describe('paymentAnomaly template', () => {
  it('renders stale partial headline', () => {
    const seed: NarrativeSeed = {
      entityCount: 1,
      totalAmount: 40000,
      customerName: 'Test Customer',
      maxUrgency: 'medium',
      windowInfo: null,
      stageLabel: null,
      customerBehavior: { readRate: 0.8, delayLikelihood: 0.2 },
    }
    const result = renderPaymentAnomalyTemplate(seed)
    expect(result.headline).toContain('Test Customer')
    expect(result.headline).toContain('40,000')
  })

  it('renders orphan payment headline when no customer', () => {
    const seed: NarrativeSeed = {
      entityCount: 0,
      totalAmount: 15000,
      customerName: null,
      maxUrgency: 'medium',
      windowInfo: null,
      stageLabel: null,
      customerBehavior: { readRate: null, delayLikelihood: null },
    }
    const result = renderPaymentAnomalyTemplate(seed)
    expect(result.headline).toContain('Unidentified')
    expect(result.headline).toContain('15,000')
  })
})

describe('communicationFailure template', () => {
  it('renders failure headline for critical urgency', () => {
    const seed: NarrativeSeed = {
      entityCount: 3,
      totalAmount: 0,
      customerName: 'Failing Customer',
      maxUrgency: 'critical',
      windowInfo: null,
      stageLabel: null,
      customerBehavior: { readRate: null, delayLikelihood: null },
    }
    const result = renderCommunicationFailureTemplate(seed)
    expect(result.headline).toContain('Failing Customer')
    expect(result.headline).toContain('failing')
  })

  it('renders silent customer headline for non-critical urgency', () => {
    const seed: NarrativeSeed = {
      entityCount: 1,
      totalAmount: 30000,
      customerName: 'Silent Reader',
      maxUrgency: 'high',
      windowInfo: null,
      stageLabel: null,
      customerBehavior: { readRate: 0, delayLikelihood: 0.1 },
    }
    const result = renderCommunicationFailureTemplate(seed)
    expect(result.headline).toContain('Silent Reader')
    expect(result.headline).toContain('not reading')
  })
})
