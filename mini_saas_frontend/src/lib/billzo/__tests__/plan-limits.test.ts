import { describe, it, expect } from 'vitest'
import { FEATURES, hasFeature, getPlan, PLAN_LIMITS, withinLimit, remaining, UNLIMITED } from '../plan-limits'

describe('plan-limits', () => {
  describe('FEATURES', () => {
    it('starter has only manual_reminders', () => {
      expect(FEATURES.starter).toEqual(['manual_reminders'])
    })

    it('starter does not have auto_recovery', () => {
      expect(FEATURES.starter).not.toContain('auto_recovery')
    })

    it('pro has recovery and queue features', () => {
      expect(FEATURES.pro).toContain('auto_recovery')
      expect(FEATURES.pro).toContain('recovery_queue')
      expect(FEATURES.pro).toContain('promise_tracking')
      expect(FEATURES.pro).toContain('cashflow_forecast')
    })

    it('business has all paid features including analytics', () => {
      expect(FEATURES.business).toContain('auto_recovery')
      expect(FEATURES.business).toContain('advanced_analytics')
      expect(FEATURES.business).toContain('exports')
    })

    it('starter has no promotional features', () => {
      expect(FEATURES.starter).not.toContain('free_recovery_trial' as any)
    })
  })

  describe('hasFeature', () => {
    it('returns true for starter having manual_reminders', () => {
      expect(hasFeature('starter', 'manual_reminders')).toBe(true)
    })

    it('returns false for starter having auto_recovery', () => {
      expect(hasFeature('starter', 'auto_recovery')).toBe(false)
    })

    it('returns true for pro having auto_recovery', () => {
      expect(hasFeature('pro', 'auto_recovery')).toBe(true)
    })

    it('returns true for business having analytics', () => {
      expect(hasFeature('business', 'advanced_analytics')).toBe(true)
    })
  })

  describe('getPlan', () => {
    it('returns pro for pro', () => {
      expect(getPlan('pro')).toBe('pro')
    })

    it('returns starter for free', () => {
      expect(getPlan('free')).toBe('starter')
    })

    it('returns starter for undefined', () => {
      expect(getPlan(undefined)).toBe('starter')
    })

    it('returns business for business (growth renamed)', () => {
      expect(getPlan('business')).toBe('business')
    })

    it('returns enterprise for enterprise', () => {
      expect(getPlan('enterprise')).toBe('enterprise')
    })
  })

  describe('PLAN_LIMITS', () => {
    it('starter allows 3 reminders, business/pro unlimited', () => {
      expect(PLAN_LIMITS.starter.reminders).toBe(3)
      expect(PLAN_LIMITS.pro.reminders).toBe(UNLIMITED)
      expect(PLAN_LIMITS.business.reminders).toBe(UNLIMITED)
    })

    it('business enables api and 5 branches', () => {
      expect(PLAN_LIMITS.business.api).toBe(true)
      expect(PLAN_LIMITS.business.branches).toBe(5)
    })

    it('enterprise is fully unlimited', () => {
      expect(PLAN_LIMITS.enterprise.reminders).toBe(UNLIMITED)
      expect(PLAN_LIMITS.enterprise.branches).toBe(UNLIMITED)
      expect(PLAN_LIMITS.enterprise.api).toBe(true)
    })
  })

  describe('withinLimit / remaining', () => {
    it('unlimited plans always pass', () => {
      expect(withinLimit(1000, UNLIMITED)).toBe(true)
      expect(remaining(1000, UNLIMITED)).toBe(UNLIMITED)
    })

    it('starter blocks beyond 3 reminders', () => {
      expect(withinLimit(2, 3)).toBe(true)
      expect(withinLimit(3, 3)).toBe(false)
      expect(remaining(2, 3)).toBe(1)
      expect(remaining(3, 3)).toBe(0)
    })
  })
})
