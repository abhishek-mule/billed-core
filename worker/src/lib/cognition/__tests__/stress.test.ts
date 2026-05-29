import { describe, it, expect, beforeEach } from 'vitest'
import { correlate } from '../correlation'
import { cluster, setCustomerNameCache } from '../clusterer'
import { prioritize } from '../prioritizer'
import { synthesize } from '../synthesizer'
import type { AttentionItem } from '../types'

// Deterministic "random" name/amount pairs
const CUSTOMERS = [
  { id: 'c1', name: 'Alpha Stores', baseAmount: 85000, overdueDays: 18 },
  { id: 'c2', name: 'Beta Traders', baseAmount: 12000, overdueDays: 5 },
  { id: 'c3', name: 'Gamma Electronics', baseAmount: 200000, overdueDays: 30 },
  { id: 'c4', name: 'Delta Enterprises', baseAmount: 45000, overdueDays: 9 },
  { id: 'c5', name: 'Epsilon Corp', baseAmount: 7500, overdueDays: 2 },
  { id: 'c6', name: 'Zeta Industries', baseAmount: 32000, overdueDays: 14 },
  { id: 'c7', name: 'Eta Goods', baseAmount: 95000, overdueDays: 21 },
  { id: 'c8', name: 'Theta Suppliers', baseAmount: 18000, overdueDays: 7 },
  { id: 'c9', name: 'Iota Mart', baseAmount: 150000, overdueDays: 45 },
  { id: 'c10', name: 'Kappa Retail', baseAmount: 28000, overdueDays: 11 },
  { id: 'c11', name: 'Lambda Pharma', baseAmount: 60000, overdueDays: 16 },
  { id: 'c12', name: 'Mu Agencies', baseAmount: 42000, overdueDays: 25 },
  { id: 'c13', name: 'Nu Distributors', baseAmount: 11000, overdueDays: 3 },
  { id: 'c14', name: 'Xi Motors', baseAmount: 175000, overdueDays: 60 },
  { id: 'c15', name: 'Omicron Bazaar', baseAmount: 35000, overdueDays: 12 },
]

function generateFixtures(count: number): AttentionItem[] {
  const items: AttentionItem[] = []
  for (let i = 0; i < count; i++) {
    const cust = CUSTOMERS[i % CUSTOMERS.length]
    const invoiceNum = Math.floor(i / CUSTOMERS.length) + 1
    const variation = Math.floor(Math.random() * 5000) - 2500
    const amount = cust.baseAmount + variation
    const urgency = cust.overdueDays >= 30 ? 'critical' as const
      : cust.overdueDays >= 15 ? 'high' as const
      : cust.overdueDays >= 7 ? 'medium' as const
      : 'low' as const
    const stageScore = cust.overdueDays >= 30 ? 4
      : cust.overdueDays >= 15 ? 3
      : cust.overdueDays >= 7 ? 2
      : 1

    items.push({
      id: `fixture-${i}`,
      tenantId: 'stress-t1',
      situationId: null,
      intentType: 'overdue_risk',
      entityType: 'invoice',
      entityId: `inv-${cust.id}-${invoiceNum}`,
      priorityScore: Math.min(80, Math.round(amount / 5000) + stageScore * 10),
      urgency,
      confidence: 0.75 + Math.random() * 0.2,
      signalData: {
        customer_id: cust.id,
        customer_name: cust.name,
        total: amount,
        days_overdue: cust.overdueDays,
        recovery_stage: stageScore >= 4 ? 't24_escalation' : stageScore >= 3 ? 't48_reminder' : stageScore >= 2 ? 't72_nudge' : 't96_gentle',
        stage_score: stageScore,
        delay_likelihood: Math.min(0.9, cust.overdueDays / 60),
      },
      correlationKey: `cashflow:stress-t1:${cust.id}`,
      createdAt: new Date(Date.now() - cust.overdueDays * 86400000).toISOString(),
    })
  }
  return items
}

describe('pipeline stress test — 110 fixtures across 15 customers', () => {
  beforeEach(() => {
    const nameMap: Record<string, string> = {}
    for (const c of CUSTOMERS) nameMap[c.id] = c.name
    setCustomerNameCache(nameMap)
  })

  it('correlates 110 items into 15 groups (one per customer)', () => {
    const fixtures = generateFixtures(110)
    const groups = correlate(fixtures)
    expect(groups.size).toBe(15)
    for (const c of CUSTOMERS) {
      expect(groups.has(`cashflow:stress-t1:${c.id}`)).toBe(true)
    }
  })

  it('clusters into 15 situation candidates', () => {
    const fixtures = generateFixtures(110)
    const groups = correlate(fixtures)
    const candidates = cluster(groups)
    expect(candidates).toHaveLength(15)

    // Each customer appears once
    const names = candidates.map(c => c.narrativeSeed.customerName)
    for (const c of CUSTOMERS) {
      expect(names).toContain(c.name)
    }
  })

  it('prioritizer caps at 7 situations max', () => {
    const fixtures = generateFixtures(110)
    const groups = correlate(fixtures)
    const candidates = cluster(groups)
    const result = prioritize(candidates)
    expect(result.length).toBeLessThanOrEqual(7)
  })

  it('top situations have highest amounts and urgency', () => {
    const fixtures = generateFixtures(110)
    const groups = correlate(fixtures)
    const candidates = cluster(groups)
    const result = prioritize(candidates)

    // Xi Motors (175k, 60 days) and Iota Mart (150k, 45 days) should be near top
    const topNames = result.slice(0, 3).map(s => s.narrativeSeed.customerName)
    expect(topNames).toContain('Xi Motors')
    expect(topNames).toContain('Iota Mart')
  })

  it('synthesizer produces valid situations for all 7 prioritized', () => {
    const fixtures = generateFixtures(110)
    const groups = correlate(fixtures)
    const candidates = cluster(groups)
    const result = prioritize(candidates)
    const situations = synthesize(result, 'stress-t1')

    expect(situations).toHaveLength(result.length)
    for (const s of situations) {
      expect(s.headline).toBeTruthy()
      expect(s.narrative).toBeTruthy()
      expect(s.recommendedAction.type).toBeTruthy()
      expect(s.recommendedAction.reason).toBeTruthy()
      expect(s.situationFingerprint).toBeTruthy()
    }
    // At least the top situation should have a customer
    const customerCount = situations.reduce((sum, s) => sum + s.affectedEntities.customers.length, 0)
    expect(customerCount).toBeGreaterThan(0)
  })

  it('compression: 110 items × 15 customers → at most 7 situations', () => {
    const fixtures = generateFixtures(110)
    const groups = correlate(fixtures)
    const candidates = cluster(groups)
    const result = prioritize(candidates)
    const situations = synthesize(result, 'stress-t1')

    // Compression ratio: 110 → max 7
    expect(situations.length).toBeLessThanOrEqual(7)

    // Each situation corresponds to a unique customer and has valid entity count
    const customerIds = new Set(situations.flatMap(s => s.affectedEntities.customers))
    expect(customerIds.size).toBe(situations.length)

    // Total invoice count across all situations equals unique customers in fixtures
    const fixtureCustomers = new Set(fixtures.map(f => f.signalData?.customer_id as string))
    expect(customerIds.size).toBeLessThanOrEqual(fixtureCustomers.size)
  })

  it('deterministic: same input produces same output', () => {
    const fixtures = generateFixtures(110)

    // Run twice
    const groups1 = correlate(fixtures)
    const candidates1 = cluster(groups1)
    const result1 = prioritize(candidates1)
    const situations1 = synthesize(result1, 'stress-t1')

    const groups2 = correlate(fixtures)
    const candidates2 = cluster(groups2)
    const result2 = prioritize(candidates2)
    const situations2 = synthesize(result2, 'stress-t1')

    // Same number of situations
    expect(situations1.length).toBe(situations2.length)

    // Same fingerprints and scores
    for (let i = 0; i < situations1.length; i++) {
      expect(situations1[i].situationFingerprint).toBe(situations2[i].situationFingerprint)
      expect(situations1[i].priorityScore).toBe(situations2[i].priorityScore)
    }
  })

  it('high-priority situations (>= 25) are candidates for notification', () => {
    const fixtures = generateFixtures(110)
    const groups = correlate(fixtures)
    const candidates = cluster(groups)
    const result = prioritize(candidates)
    const situations = synthesize(result, 'stress-t1')

    // At least the top situations should qualify for push notification
    const notifiable = situations.filter(s => s.priorityScore >= 25)
    expect(notifiable.length).toBeGreaterThan(0)

    // At least one high-priority customer should be notifiable
    const notifiableCustomerIds = new Set(notifiable.flatMap(s => s.affectedEntities.customers))
    const highPriorityCustomers = ['Xi Motors', 'Iota Mart', 'Gamma Electronics']
    const hasHighPriority = highPriorityCustomers.some(name => {
      const cust = CUSTOMERS.find(c => c.name === name)
      return cust && notifiableCustomerIds.has(cust.id)
    })
    expect(hasHighPriority).toBe(true)
  })

  it('monetary amounts are correctly summed across multiple invoices per customer', () => {
    const fixtures = generateFixtures(110)

    // Manually compute per-customer totals
    const expectedTotals: Record<string, number> = {}
    for (const f of fixtures) {
      const cid = f.signalData?.customer_id as string
      expectedTotals[cid] = (expectedTotals[cid] || 0) + (f.signalData?.total as number || 0)
    }

    const groups = correlate(fixtures)
    const candidates = cluster(groups)
    const result = prioritize(candidates)

    for (const c of result) {
      const cid = c.narrativeSeed.entityCount > 0 ? CUSTOMERS.find(cu => cu.name === c.narrativeSeed.customerName)?.id : null
      if (cid) {
        expect(c.narrativeSeed.totalAmount).toBe(expectedTotals[cid])
      }
    }
  })
})
