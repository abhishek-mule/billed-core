import { describe, it, expect } from 'vitest'
import { FEATURES, hasFeature, getPlan } from '../plan-limits'

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

    it('growth has all features including analytics', () => {
      expect(FEATURES.growth).toContain('auto_recovery')
      expect(FEATURES.growth).toContain('advanced_analytics')
      expect(FEATURES.growth).toContain('exports')
    })

    it('starter has no promotional features', () => {
      // free_recovery_trial is NOT a permanent feature
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

    it('returns true for growth having analytics', () => {
      expect(hasFeature('growth', 'advanced_analytics')).toBe(true)
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

    it('returns growth for growth', () => {
      expect(getPlan('growth')).toBe('growth')
    })
  })
})
