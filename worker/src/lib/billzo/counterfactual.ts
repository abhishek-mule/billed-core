import type { CohortDefinition, ExperimentAssignment, ExperimentTreatment, BaselineEstimate, PredictionOutcome, DomainContext } from '@billzo/shared'
import { createDomainContext } from '@billzo/shared'
import crypto from 'crypto'

const MIN_SAMPLE_SIZE = 5
const BASELINE_CONFIDENCE_FACTOR = 0.2

export function assignToExperiment(
  customerId: string,
  tenantId: string,
  cohorts: CohortDefinition[],
  ctx?: DomainContext,
): ExperimentAssignment | null {
  if (cohorts.length === 0) return null
  const clock = ctx?.clock ?? createDomainContext().clock

  const now = clock.now()
  const seed = `${tenantId}:${customerId}`
  const hash = crypto.createHash('md5').update(seed).digest('hex')
  const normalized = parseInt(hash.slice(0, 8), 16) / 0xffffffff

  let cumulative = 0
  for (const cohort of cohorts) {
    cumulative += cohort.controlFraction
    if (normalized < cumulative) {
      const isControl = normalized < cohort.controlFraction * 0.5
      return {
        cohortId: cohort.id,
        customerId,
        tenantId,
        treatment: isControl ? 'control' : 'intervention',
        assignedAt: now,
        assignmentFactor: cohort.controlFraction,
      }
    }
  }

  // Fallthrough: assign to last cohort as delayed
  const last = cohorts[cohorts.length - 1]
  return {
    cohortId: last.id,
    customerId,
    tenantId,
    treatment: 'delayed',
    assignedAt: now,
    assignmentFactor: last.controlFraction,
  }
}

export function computeBaseRate(
  pairs: PredictionOutcome[],
): BaselineEstimate | null {
  if (pairs.length < MIN_SAMPLE_SIZE) return null

  const metric = pairs[0].metric
  const successes = pairs.filter(p => p.actual === 1).length
  const baseRate = successes / pairs.length
  const confidence = 1 - Math.exp(-pairs.length * BASELINE_CONFIDENCE_FACTOR)

  return {
    metric,
    baseRate,
    sampleSize: pairs.length,
    confidence,
  }
}

export function computeAttributionLift(
  treatmentPairs: PredictionOutcome[],
  controlPairs: PredictionOutcome[],
): number | null {
  if (treatmentPairs.length < MIN_SAMPLE_SIZE || controlPairs.length < MIN_SAMPLE_SIZE) {
    return null
  }

  const treatmentRate = treatmentPairs.filter(p => p.actual === 1).length / treatmentPairs.length
  const controlRate = controlPairs.filter(p => p.actual === 1).length / controlPairs.length

  if (controlRate === 0) {
    return treatmentRate > 0 ? Infinity : 0
  }

  return (treatmentRate - controlRate) / controlRate
}
