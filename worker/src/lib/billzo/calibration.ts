import type { PredictionOutcome, CalibrationBin, CalibrationReport } from '@billzo/shared'

export function buildCalibrationBins(
  pairs: PredictionOutcome[],
  binCount = 10,
): CalibrationBin[] {
  if (pairs.length === 0) return []

  const sorted = [...pairs].sort((a, b) => a.predicted - b.predicted)
  const bins: CalibrationBin[] = []

  for (let i = 0; i < binCount; i++) {
    const binStart = i / binCount
    const binEnd = (i + 1) / binCount
    const isLastBin = i === binCount - 1
    const inBin = sorted.filter(p =>
      isLastBin
        ? p.predicted >= binStart && p.predicted <= binEnd
        : p.predicted >= binStart && p.predicted < binEnd,
    )

    if (inBin.length === 0) {
      bins.push({
        binIndex: i,
        count: 0,
        meanPredicted: (binStart + binEnd) / 2,
        actualRate: 0,
        residual: 0,
      })
      continue
    }

    const meanPredicted = inBin.reduce((s, p) => s + p.predicted, 0) / inBin.length
    const actualRate = inBin.reduce((s, p) => s + p.actual, 0) / inBin.length

    bins.push({
      binIndex: i,
      count: inBin.length,
      meanPredicted,
      actualRate,
      residual: meanPredicted - actualRate,
    })
  }

  return bins
}

export function computeECE(bins: CalibrationBin[]): number {
  const total = bins.reduce((s, b) => s + b.count, 0)
  if (total === 0) return 0

  const weightedError = bins.reduce((s, b) => s + b.count * Math.abs(b.residual), 0)
  return weightedError / total
}

export function computeMACE(bins: CalibrationBin[]): number {
  const nonEmpty = bins.filter(b => b.count > 0)
  if (nonEmpty.length === 0) return 0

  return nonEmpty.reduce((s, b) => s + Math.abs(b.residual), 0) / nonEmpty.length
}

export function computeReliabilityCurve(
  bins: CalibrationBin[],
): { predicted: number; actual: number }[] {
  return bins
    .filter(b => b.count > 0)
    .map(b => ({
      predicted: b.meanPredicted,
      actual: b.actualRate,
    }))
}

export function computeCalibrationReport(
  pairs: PredictionOutcome[],
  metric: string,
  condition?: string,
): CalibrationReport {
  const bins = buildCalibrationBins(pairs)
  return {
    metric,
    bins,
    ece: computeECE(bins),
    mace: computeMACE(bins),
    totalPairs: pairs.length,
    condition,
  }
}
