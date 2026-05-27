// ============================================================
// ORCHESTRATION SNAPSHOT — Frozen decision record for forensic replay
// ============================================================
// Every orchestration decision emits a snapshot to the outbox.
// This captures:
//   - what was decided (recommendation)
//   - why (rule traces + human rationale)
//   - how confident (per-decision confidence)
//   - what behavioral context existed (frozen traits)
//   - which interpreter versions produced that context
//
// This prevents historical non-determinism: you can always replay
// what the system *actually* decided, not what it *would* decide
// with today's logic. See the DESIGN_NOTES for the full rationale.
// ============================================================

import type { OrchestrationInput, SendRecommendation, DecisionRuleTrace, DecisionConfidence, OrchestrationSnapshot, BehavioralInterpreterVersions } from '@billzo/shared'
import { ORCHESTRATOR_POLICY_VERSION, ORCHESTRATOR_CODE_VERSION } from '@billzo/shared'
import { canonicalHash } from './stable-canonicalize'
import { buildRecommendationFull, computeDecisionConfidence, buildRationale } from './orchestrator'
import { ENTROPY_INTERPRETER_VERSION } from './behavioral-entropy'
import { OBSERVATION_INTERPRETER_VERSION } from './observation-interpreter'
import { CALIBRATION_VERSION } from './calibration'
import { TRAITS_VERSION } from './compute-behavioral-traits'
import { ATTRIBUTION_VERSION } from './attribution'
import { writeOutboxEvent } from './outbox'
import { generateCorrelationId } from './idempotency'

// ============================================================
// VERSION RESOLUTION
// ============================================================

function getInterpreterVersions(): BehavioralInterpreterVersions {
  return {
    entropy: ENTROPY_INTERPRETER_VERSION,
    traits: TRAITS_VERSION,
    attribution: ATTRIBUTION_VERSION,
    calibration: CALIBRATION_VERSION,
    observation: OBSERVATION_INTERPRETER_VERSION,
  }
}

// ============================================================
// INPUT HASH (deterministic, canonical)
// ============================================================

function computeInputHash(input: OrchestrationInput): string {
  const { context, invoice, operatingHours } = input
  return canonicalHash({ context, invoice, operatingHours })
}

// ============================================================
// SNAPSHOT BUILDER
// ============================================================

export function buildSnapshot(input: OrchestrationInput, meta: { triggeredBy: string }): {
  snapshot: OrchestrationSnapshot
  recommendation: SendRecommendation
  traces: DecisionRuleTrace[]
  confidence: DecisionConfidence
} {
  const { recommendation, traces, confidence } = buildRecommendationFull(input)
  const { context, invoice } = input

  const snapshot: OrchestrationSnapshot = {
    invoiceId: invoice.id,
    customerId: context.customerId,
    tenantId: context.tenantId,
    policyVersion: ORCHESTRATOR_POLICY_VERSION,
    orchestratorVersion: ORCHESTRATOR_CODE_VERSION,
    inputHash: computeInputHash(input),
    interpreterVersions: getInterpreterVersions(),
    behavioralSnapshot: {
      traits: {
        temporalRegularity: { value: context.traits.temporalRegularity.value, priorSource: context.traits.temporalRegularity.priorSource, evidenceWeight: context.traits.temporalRegularity.evidenceWeight },
        constraintAffinity: { value: context.traits.constraintAffinity.value, priorSource: context.traits.constraintAffinity.priorSource, evidenceWeight: context.traits.constraintAffinity.evidenceWeight },
        strategicDelayLikelihood: { value: context.traits.strategicDelayLikelihood.value, priorSource: context.traits.strategicDelayLikelihood.priorSource, evidenceWeight: context.traits.strategicDelayLikelihood.evidenceWeight },
        disputeRisk: { value: context.traits.disputeRisk.value, priorSource: context.traits.disputeRisk.priorSource, evidenceWeight: context.traits.disputeRisk.evidenceWeight },
        channelViability: { value: context.traits.channelViability.value, priorSource: context.traits.channelViability.priorSource, evidenceWeight: context.traits.channelViability.evidenceWeight },
      },
      readRate: context.readRate,
      channelViability: context.channelViability,
      entropy: context.entropy,
      priorSource: context.priorSource,
      observationCount: context.observationCount,
    },
    recommendation,
    decisionConfidence: confidence,
    ruleTraces: traces,
    rationale: buildRationale(input, recommendation.timing, recommendation.channel, recommendation.content, recommendation.cadence, recommendation.escalation),
    executedAt: new Date().toISOString(),
    triggeredBy: meta.triggeredBy,
  }

  return { snapshot, recommendation, traces, confidence }
}

// ============================================================
// SNAPSHOT EMITTER
// ============================================================

export async function emitOrchestrationSnapshot(
  input: OrchestrationInput,
  meta: { triggeredBy: string },
  causationId: string | null = null,
): Promise<string> {
  const { snapshot } = buildSnapshot(input, meta)
  const correlationId = generateCorrelationId(snapshot.invoiceId)

  return writeOutboxEvent({
    type: 'orchestration.decision.made',
    tenantId: snapshot.tenantId,
    entityId: snapshot.invoiceId,
    payload: snapshot as unknown as Record<string, unknown>,
    causationId,
    correlationId,
    idempotencyKey: `orchestration:snapshot:${snapshot.invoiceId}:${snapshot.executedAt}`,
    version: 1,
  })
}
