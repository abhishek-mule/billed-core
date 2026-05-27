import { describe, it, expect } from 'vitest'
import { decayedEMA, computeConfidence, daysBetween } from '../../decay'

describe('decayedEMA', () => {
  it('returns new value when old value is 0', () => {
    const result = decayedEMA(0, 1.0, 0, 30)
    expect(result).toBeCloseTo(1.0, 4)
  })

  it('applies decay factor correctly', () => {
    const result = decayedEMA(1.0, 0, 30, 30)
    // factor = e^(-30/30) = e^-1 ≈ 0.3679
    // result = 1.0 * 0.3679 + 0 * (1 - 0.3679) = 0.3679
    expect(result).toBeCloseTo(0.3679, 3)
  })

  it('blends old and new values', () => {
    const result = decayedEMA(0.8, 0.5, 10, 30)
    // factor = e^(-10/30) = e^-0.333 ≈ 0.7165
    // result = 0.8 * 0.7165 + 0.5 * (1 - 0.7165) = 0.5732 + 0.1417 = 0.715
    expect(result).toBeCloseTo(0.715, 2)
  })

  it('handles zero delta days', () => {
    const result = decayedEMA(0.5, 1.0, 0, 30)
    // factor = e^0 = 1, so result = old value
    expect(result).toBeCloseTo(0.5, 4)
  })

  it('handles very large delta days (near-complete decay)', () => {
    const result = decayedEMA(1.0, 0.5, 365, 30)
    // factor ≈ 0 (e^(-365/30) = e^-12.17 ≈ 5e-6)
    // result ≈ 0.5
    expect(result).toBeCloseTo(0.5, 2)
  })
})

describe('computeConfidence', () => {
  it('returns 0 for 0 observations', () => {
    expect(computeConfidence(0)).toBeCloseTo(0, 2)
  })

  it('returns ~0.095 for 1 observation', () => {
    // 1 - e^(-1/20) = 1 - e^-0.05 = 1 - 0.9512 = 0.0488
    expect(computeConfidence(1)).toBeCloseTo(0.0488, 3)
  })

  it('returns ~0.632 for 20 observations (saturation point)', () => {
    // 1 - e^(-20/20) = 1 - e^-1 = 1 - 0.3679 = 0.6321
    expect(computeConfidence(20)).toBeCloseTo(0.6321, 3)
  })

  it('returns ~0.95 for 60 observations', () => {
    // 1 - e^(-60/20) = 1 - e^-3 ≈ 1 - 0.0498 = 0.9502
    expect(computeConfidence(60)).toBeCloseTo(0.9502, 3)
  })

  it('approaches 1 asymptotically with many observations', () => {
    const confidence = computeConfidence(500)
    expect(confidence).toBeGreaterThan(0.99)
    expect(confidence).toBeLessThan(1.0)
  })

  it('uses custom saturation point', () => {
    const withDefault = computeConfidence(10)
    const withCustom = computeConfidence(10, 5)
    expect(withCustom).toBeGreaterThan(withDefault)
  })
})

describe('daysBetween', () => {
  it('returns 0 for same timestamp', () => {
    const d = new Date()
    expect(daysBetween(d, d)).toBeCloseTo(0, 4)
  })

  it('returns 1 for 24h apart', () => {
    const d1 = new Date('2026-01-01T00:00:00Z')
    const d2 = new Date('2026-01-02T00:00:00Z')
    expect(daysBetween(d1, d2)).toBeCloseTo(1, 4)
  })

  it('returns negative if later is before earlier', () => {
    const d1 = new Date('2026-01-02T00:00:00Z')
    const d2 = new Date('2026-01-01T00:00:00Z')
    expect(daysBetween(d1, d2)).toBeLessThan(0)
  })
})
