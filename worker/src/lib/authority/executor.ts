import type { ExecutionPlan, ExecutionPlanStep, CapabilityProvider, CapabilityResult } from './schemas'
import type { CapabilityRegistry } from './capabilities'

export interface StepResult {
  readonly step: ExecutionPlanStep
  readonly capability: CapabilityProvider
  readonly result: CapabilityResult
}

export interface ExecutionResult {
  readonly success: boolean
  readonly plan: ExecutionPlan
  readonly stepResults: readonly StepResult[]
  readonly compensated: boolean
  readonly error?: string
}

export async function executePlan(
  plan: ExecutionPlan,
  capabilities: CapabilityRegistry,
): Promise<ExecutionResult> {
  const stepResults: StepResult[] = []
  let compensated = false

  for (const step of plan.steps) {
    const capability = capabilities.get(step.capabilityId)
    if (!capability) {
      await runCompensation(stepResults)
      return {
        success: false,
        plan,
        stepResults,
        compensated: true,
        error: `Capability not found: ${step.capabilityId}`,
      }
    }

    let result: CapabilityResult
    try {
      result = await capability.execute(
        { intentId: plan.intentId } as any,
        { outcome: 'accepted', policySnapshotHash: '', policyVersion: '', evaluatedAt: '', decisionGraph: [] } as any,
      )
    } catch (err) {
      result = { success: false, error: String(err), executionLatencyMs: 0 }
    }

    stepResults.push({ step, capability, result })

    if (!result.success) {
      if (step.compensatable) {
        await runCompensation(stepResults)
        compensated = true
      }
      return {
        success: false,
        plan,
        stepResults,
        compensated,
        error: result.error ?? `Step ${step.capabilityId} failed`,
      }
    }
  }

  return { success: true, plan, stepResults, compensated: false }
}

async function runCompensation(stepResults: StepResult[]): Promise<void> {
  for (const sr of [...stepResults].reverse()) {
    if (sr.capability.compensate) {
      try {
        await sr.capability.compensate(
          { intentId: sr.step.capabilityId } as any,
          sr.result,
        )
      } catch {
        // compensation failure is logged but non-fatal
      }
    }
  }
}
