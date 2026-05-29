import { canonicalHash } from './hashing'
import type {
  IntentEnvelope,
  CapabilityProvider,
  ExecutionPlan,
  ExecutionPlanStep,
} from './schemas'

export interface PlanBuilderConfig {
  readonly plannerVersion: string
}

const DEFAULT_CONFIG: PlanBuilderConfig = {
  plannerVersion: '2026.05.28-alpha',
}

export function buildExecutionPlan(
  intent: IntentEnvelope,
  steps: readonly CapabilityProvider[],
  policySnapshotHash: string,
  registrySnapshotHash: string,
  config: PlanBuilderConfig = DEFAULT_CONFIG,
): ExecutionPlan {
  const compiledSteps: ExecutionPlanStep[] = steps.map((c, i) => ({
    capabilityId: c.capabilityId,
    order: i,
    compensatable: c.compensatable,
    requiresApproval: c.requiresApproval,
    priorityClass: c.priorityClass,
    implementationHash: canonicalHash({
      capability: c.capabilityId,
      classification: c.classification,
    }),
    input: { ...intent.payload },
  }))

  const planHashInput = {
    intentId: intent.intentId,
    steps: compiledSteps.map((s) => s.capabilityId),
    policySnapshotHash,
    registrySnapshotHash,
    plannerVersion: config.plannerVersion,
  }

  const planHash = canonicalHash(planHashInput)

  const capabilityImplementationHashes: Record<string, string> = {}
  for (const c of steps) {
    capabilityImplementationHashes[c.capabilityId] = canonicalHash({
      capability: c.capabilityId,
      classification: c.classification,
    })
  }

  return {
    intentId: intent.intentId,
    planHash,
    planCompilerVersion: config.plannerVersion,
    steps: compiledSteps,
    capabilityImplementationHashes,
    policySnapshotHash,
    registrySnapshotHash,
  }
}
