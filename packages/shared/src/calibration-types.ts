// ============================================================
// CALIBRATION TYPES
// ============================================================
// Supports offline evaluation of probabilistic outputs.
// Calibration metrics compare predicted confidence against
// actual binary outcomes.
//
// design principles:
//   1. pure functional — no DB dependencies
//   2. condition field exists as API shape for future regime-sliced calibration
//   3. metric strings align with CustomerBehavioralMetrics field names
// ============================================================

export interface PredictionOutcome {
  predicted: number
  actual: 0 | 1
  metric: 'read_rate' | 'payment_conversion' | 'channel_viability' | 'resolution_probability'
  observationCount: number
}

export interface CalibrationBin {
  binIndex: number
  count: number
  meanPredicted: number
  actualRate: number
  residual: number
}

export interface CalibrationReport {
  metric: string
  bins: CalibrationBin[]
  ece: number
  mace: number
  totalPairs: number
  condition?: string
}
