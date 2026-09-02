// ============================================================
// ATTRIBUTION TRUTH — the single rule for outcome attribution
// ============================================================
//
// Phase 1.5 constraint #5: missing causal identity must mean
// 'unknown', never an inferred 'verified'. This pure function is
// the single source of truth so every outcome writer (payment,
// delivery, reply, promise) behaves identically.
//
// Time proximity is deliberately absent: a payment 10 seconds
// after a reminder WITH no explicit recovery_attempt_id is still
// UNKNOWN. Causality is carried by identity, never by timing.
// ============================================================

export type AttributionStatus = 'verified' | 'unknown'

export interface AttributionTruth {
  attribution_status: AttributionStatus
  attribution_method: 'explicit' | null
  confidence_score: number | null
}

export function attributabilityOf(recoveryAttemptId?: string | null): AttributionTruth {
  if (recoveryAttemptId) {
    return {
      attribution_status: 'verified',
      attribution_method: 'explicit',
      confidence_score: 1,
    }
  }
  return {
    attribution_status: 'unknown',
    attribution_method: null,
    confidence_score: null,
  }
}