import { jsDivergence } from '../histograms'
import type { ProbabilityDistribution } from '../histograms'

export interface DriftConfig {
  warningThreshold: number
  criticalThreshold: number
  minimumSamples: number
}

export const DEFAULT_DRIFT_CONFIG: DriftConfig = {
  warningThreshold: 0.12,
  criticalThreshold: 0.25,
  minimumSamples: 20,
}

export interface DriftReport {
  hasDrifted: boolean
  severity: 'none' | 'warning' | 'critical'
  divergence: number
  changedFields: string[]
  detectedAt: string
}

export function detectHistogramDrift(
  current: ProbabilityDistribution[],
  historical: ProbabilityDistribution[],
  fieldNames: string[],
  config: DriftConfig = DEFAULT_DRIFT_CONFIG,
): DriftReport {
  const changedFields: string[] = []
  let maxDivergence = 0

  for (let i = 0; i < current.length; i++) {
    if (current[i].length !== historical[i]?.length) {
      changedFields.push(fieldNames[i] || `field_${i}`)
      continue
    }
    const divergence = jsDivergence(current[i], historical[i])
    if (divergence > config.warningThreshold) {
      changedFields.push(fieldNames[i] || `field_${i}`)
    }
    maxDivergence = Math.max(maxDivergence, divergence)
  }

  const hasDrifted = changedFields.length > 0
  let severity: DriftReport['severity'] = 'none'
  if (maxDivergence >= config.criticalThreshold) {
    severity = 'critical'
  } else if (maxDivergence >= config.warningThreshold) {
    severity = 'warning'
  }

  return {
    hasDrifted,
    severity,
    divergence: maxDivergence,
    changedFields,
    detectedAt: new Date().toISOString(),
  }
}
