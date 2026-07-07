export interface FieldConfidenceMap {
  [field: string]: number
}

export interface ConfidenceConfig {
  minimumSamples: number
  highThreshold: number
  mediumThreshold: number
}

const DEFAULT_CONFIDENCE_CONFIG: ConfidenceConfig = {
  minimumSamples: 5,
  highThreshold: 0.8,
  mediumThreshold: 0.5,
}

export function computeFieldConfidence(
  sampleCount: number,
  variance: number,
  config: ConfidenceConfig = DEFAULT_CONFIDENCE_CONFIG,
): number {
  if (sampleCount < config.minimumSamples) {
    return sampleCount / config.minimumSamples * 0.3
  }
  const sizeFactor = 1 - Math.exp(-sampleCount / 20)
  const varianceFactor = 1 - Math.min(variance, 1)
  return Math.min(1, Math.max(0, sizeFactor * 0.6 + varianceFactor * 0.4))
}

export function computeOverallConfidence(fieldConfidences: FieldConfidenceMap): number {
  const values = Object.values(fieldConfidences)
  if (values.length === 0) return 0
  return values.reduce((min, v) => Math.min(min, v), 1)
}

export function classifyConfidence(score: number, config: ConfidenceConfig = DEFAULT_CONFIDENCE_CONFIG): 'high' | 'medium' | 'low' {
  if (score >= config.highThreshold) return 'high'
  if (score >= config.mediumThreshold) return 'medium'
  return 'low'
}
