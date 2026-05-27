import { describe, it, expect } from 'vitest'
import { buildCalibrationBins, computeECE, computeMACE, computeReliabilityCurve, computeCalibrationReport } from '../../calibration'
import type { PredictionOutcome } from '@billzo/shared'

function makePair(overrides: Partial<PredictionOutcome> = {}): PredictionOutcome {
  return {
    predicted: 0.5,
    actual: 1,
    metric: 'read_rate',
    observationCount: 10,
    ...overrides,
  }
}

describe('buildCalibrationBins', () => {
  it('returns empty array for no pairs', () => {
    expect(buildCalibrationBins([])).toEqual([])
  })

  it('produces 10 bins by default', () => {
    const pairs = Array.from({ length: 100 }, (_, i) => makePair({
      predicted: (i % 10) / 10 + 0.05,
      actual: (i % 2) as 0 | 1,
    }))
    const bins = buildCalibrationBins(pairs)
    expect(bins.length).toBe(10)
  })

  it('assigns edge case predicted=1.0 to the last bin', () => {
    const pairs = [
      makePair({ predicted: 1.0, actual: 1 }),
    ]
    const bins = buildCalibrationBins(pairs)
    const last = bins[bins.length - 1]
    expect(last.count).toBe(1)
  })
})

describe('computeECE', () => {
  it('returns 0 for empty bins', () => {
    expect(computeECE([])).toBe(0)
  })

  it('returns ~0 for perfectly calibrated bins', () => {
    const bins = Array.from({ length: 10 }, (_, i) => ({
      binIndex: i,
      count: 10,
      meanPredicted: (i + 0.5) / 10,
      actualRate: (i + 0.5) / 10,
      residual: 0,
    }))
    expect(computeECE(bins)).toBeCloseTo(0, 10)
  })

  it('returns ~0.1 for systematic +0.1 offset', () => {
    const bins = Array.from({ length: 10 }, (_, i) => ({
      binIndex: i,
      count: 10,
      meanPredicted: (i + 0.5) / 10 + 0.1,
      actualRate: (i + 0.5) / 10,
      residual: 0.1,
    }))
    expect(computeECE(bins)).toBeCloseTo(0.1, 5)
  })

  it('weights bins by count', () => {
    const bins = [
      { binIndex: 0, count: 100, meanPredicted: 0.5, actualRate: 0.4, residual: 0.1 },
      { binIndex: 1, count: 1, meanPredicted: 0.9, actualRate: 0, residual: 0.9 },
    ]
    // Weighted: (100*0.1 + 1*0.9) / 101 ≈ 0.1079
    expect(computeECE(bins)).toBeCloseTo(0.1079, 3)
  })
})

describe('computeMACE', () => {
  it('returns 0 for empty bins', () => {
    expect(computeMACE([])).toBe(0)
  })

  it('returns same as ECE when all bins have equal count', () => {
    const bins = Array.from({ length: 10 }, (_, i) => ({
      binIndex: i,
      count: 10,
      meanPredicted: (i + 0.5) / 10,
      actualRate: (i + 0.5) / 10 - 0.05,
      residual: 0.05,
    }))
    expect(computeMACE(bins)).toBeCloseTo(0.05, 5)
    expect(computeECE(bins)).toBeCloseTo(0.05, 5)
  })
})

describe('computeReliabilityCurve', () => {
  it('excludes empty bins', () => {
    const bins = [
      { binIndex: 0, count: 5, meanPredicted: 0.1, actualRate: 0.2, residual: -0.1 },
      { binIndex: 1, count: 0, meanPredicted: 0.3, actualRate: 0, residual: 0 },
      { binIndex: 2, count: 3, meanPredicted: 0.5, actualRate: 0.6, residual: -0.1 },
    ]
    const curve = computeReliabilityCurve(bins)
    expect(curve.length).toBe(2)
  })
})

describe('computeCalibrationReport', () => {
  it('returns report with condition field', () => {
    const pairs = Array.from({ length: 50 }, (_, i) => makePair({
      predicted: 0.5 + (i % 10 - 5) * 0.02,
      actual: i % 2 === 0 ? 1 : 0,
    }))
    const report = computeCalibrationReport(pairs, 'read_rate', 'obsCount>20')
    expect(report.metric).toBe('read_rate')
    expect(report.condition).toBe('obsCount>20')
    expect(report.totalPairs).toBe(50)
    expect(report.bins.length).toBe(10)
    expect(report.ece).toBeGreaterThanOrEqual(0)
    expect(report.mace).toBeGreaterThanOrEqual(0)
  })

  it('default condition is undefined when not provided', () => {
    const pairs = [makePair()]
    const report = computeCalibrationReport(pairs, 'payment_conversion')
    expect(report.condition).toBeUndefined()
  })

  it('handles fully degenerate all-0 actuals', () => {
    const pairs = Array.from({ length: 100 }, (_, i) => makePair({
      predicted: 0.1 + (i % 9) * 0.1,
      actual: 0,
    }))
    const report = computeCalibrationReport(pairs, 'channel_viability')
    expect(report.ece).toBeGreaterThan(0)
    // All predicted values are above 0 but actual is always 0
    // ECE should reflect the systematic overconfidence
    const lastBin = report.bins[report.bins.length - 1]
    if (lastBin.count > 0) {
      expect(lastBin.actualRate).toBe(0)
    }
  })
})
