// ============================================================
// COUNTERFACTUAL / EXPERIMENT TYPES
// ============================================================
// Scaffold for causal attribution and shadow experiments.
// This is instrumentation, not production logic.
//
// design principles:
//   1. pure types — no execution semantics
//   2. no production estimator (use replay + offline evaluation)
//   3. cohort definitions remain separate from assignment logic
// ============================================================

export type CohortAssignmentStrategy = 'random' | 'time_bucketed' | 'customer_property'

export type ExperimentTreatment = 'intervention' | 'control' | 'delayed'

export interface CohortDefinition {
  id: string
  tenantId: string
  name: string
  assignmentStrategy: CohortAssignmentStrategy
  controlFraction: number
  startDate: string
  endDate?: string
}

export interface ExperimentAssignment {
  cohortId: string
  customerId: string
  tenantId: string
  treatment: ExperimentTreatment
  assignedAt: string
  assignmentFactor: number
}

export interface BaselineEstimate {
  metric: string
  baseRate: number
  sampleSize: number
  confidence: number
}
