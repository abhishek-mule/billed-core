// ============================================================
// Authority Gateway — Constitutional Violation Telemetry
// ============================================================
// Lightweight counters per DecisionNodeType.  Incremented each
// time a decision graph node fails (sovereignty, dedup,
// capability resolution, policy).
//
// Thread-safe for concurrent evaluate() calls.
// ============================================================

import type { DecisionNodeType } from './schemas'

export interface TelemetrySnapshot {
  readonly totalEvaluations: number
  readonly violations: Readonly<Record<string, number>>
  readonly violationsByNode: Readonly<Record<DecisionNodeType, number>>
}

class ConstitutionalTelemetry {
  private _totalEvaluations = 0
  private _violations = 0
  private _violationsByNode = new Map<DecisionNodeType, number>()

  incrementEvaluation(): void {
    this._totalEvaluations++
  }

  recordViolation(nodeType: DecisionNodeType): void {
    this._violations++
    this._violationsByNode.set(nodeType, (this._violationsByNode.get(nodeType) ?? 0) + 1)
  }

  snapshot(): TelemetrySnapshot {
    return {
      totalEvaluations: this._totalEvaluations,
      violations: { total: this._violations },
      violationsByNode: Object.fromEntries(this._violationsByNode) as Record<DecisionNodeType, number>,
    }
  }

  reset(): void {
    this._totalEvaluations = 0
    this._violations = 0
    this._violationsByNode.clear()
  }
}

export const constitutionalTelemetry = new ConstitutionalTelemetry()
