import { describe, it, expect } from 'vitest'
import {
  getCollectionRisk,
  collectionRiskStageFromDays,
  COLLECTION_RISK_STAGES,
  type CollectionRiskStage,
} from '../recovery-risk'

describe('collectionRiskStageFromDays', () => {
  it('maps non-overdue / future to Healthy', () => {
    expect(collectionRiskStageFromDays(-5)).toBe('Healthy')
    expect(collectionRiskStageFromDays(0)).toBe('Healthy')
  })

  it('maps 1–7 days to Monitor', () => {
    expect(collectionRiskStageFromDays(1)).toBe('Monitor')
    expect(collectionRiskStageFromDays(7)).toBe('Monitor')
  })

  it('maps 8–15 days to Attention', () => {
    expect(collectionRiskStageFromDays(8)).toBe('Attention')
    expect(collectionRiskStageFromDays(15)).toBe('Attention')
  })

  it('maps 16–30 days to Urgent', () => {
    expect(collectionRiskStageFromDays(16)).toBe('Urgent')
    expect(collectionRiskStageFromDays(30)).toBe('Urgent')
  })

  it('maps 31+ days to Critical', () => {
    expect(collectionRiskStageFromDays(31)).toBe('Critical')
    expect(collectionRiskStageFromDays(120)).toBe('Critical')
  })
})

describe('getCollectionRisk', () => {
  it('returns Healthy for non-outstanding accounts regardless of days', () => {
    const r = getCollectionRisk({ outstanding: false, overdueDays: 90 })
    expect(r.stage).toBe('Healthy')
    expect(r.rank).toBe(0)
  })

  it('defaults outstanding to true when overdueDays is provided', () => {
    const r = getCollectionRisk({ overdueDays: 5 })
    expect(r.stage).toBe('Monitor')
  })

  it('escalates one stage for a broken promise', () => {
    const base = getCollectionRisk({ overdueDays: 5 }) // Monitor
    const escalated = getCollectionRisk({ overdueDays: 5, brokenPromises: 1 })
    expect(escalated.stage).toBe('Attention')
    expect(escalated.rank).toBeGreaterThan(base.rank)
  })

  it('escalates one stage for >=3 ignored reminders', () => {
    const escalated = getCollectionRisk({ overdueDays: 5, ignoredReminders: 3 })
    expect(escalated.stage).toBe('Attention')
  })

  it('never escalates past Critical', () => {
    const r = getCollectionRisk({
      overdueDays: 31,
      brokenPromises: 2,
      ignoredReminders: 5,
    })
    expect(r.stage).toBe('Critical')
  })

  it('assigns monotonic ranks across stages', () => {
    const ranks = COLLECTION_RISK_STAGES.map(
      (s: CollectionRiskStage) => getCollectionRisk({ overdueDays: stageToDays(s) }).rank,
    )
    expect(ranks).toEqual([0, 1, 2, 3, 4])
  })

  it('exposes a recommendation and tone per stage', () => {
    const r = getCollectionRisk({ overdueDays: 40 })
    expect(r.stage).toBe('Critical')
    expect(r.tone).toBe('danger')
    expect(typeof r.recommendation).toBe('string')
    expect(r.recommendation.length).toBeGreaterThan(0)
  })
})

function stageToDays(stage: CollectionRiskStage): number {
  switch (stage) {
    case 'Healthy':
      return 0
    case 'Monitor':
      return 3
    case 'Attention':
      return 10
    case 'Urgent':
      return 20
    case 'Critical':
      return 40
  }
}
