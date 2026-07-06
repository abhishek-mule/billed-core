// ============================================================
// RECOVERY ORCHESTRATOR — Decides WHAT to do next
// ============================================================
//
// This is a thin wrapper that combines:
//   1. Existing Decision Engine (canSendReminder) — pre-send safety checks
//   2. Existing Orchestrator (buildRecommendation) — behavioral timing/channel
//
// It produces a RecoveryPlan: what action to take next and why.
// The ActionPlanner then resolves which provider/channel to use.
//
// Phase A: Passes through to existing decision engine.
// Phase B: Adds behavioral context, merchant policy, learning feedback.
// ============================================================

import {
  type CanSendReminderInput,
  type CanSendReminderOutput,
  RecoveryPolicies,
} from '@billzo/shared'
import type { RecoveryPlan } from '@billzo/shared'

const REMINDER_STAGE_ORDER = ['t0_soft', 't24_nudge', 't72_strong', 't5_warning']

function stageIndex(stage: string): number {
  return REMINDER_STAGE_ORDER.indexOf(stage)
}

export interface OrchestrateInput {
  decisionInput: CanSendReminderInput
  decisionOutput: CanSendReminderOutput
  recoveryStage: string
  outstanding: number
}

export function createRecoveryPlan(input: OrchestrateInput): RecoveryPlan {
  const { decisionOutput, recoveryStage, outstanding } = input

  if (!decisionOutput.allowed) {
    const isBlock = decisionOutput.decision === 'block'
    return {
      actionType: isBlock ? 'wait' : 'wait',
      goal: 'engagement',
      confidence: decisionOutput.confidence,
      priority: 10,
      timing: {
        immediate: false,
        scheduledAt: decisionOutput.nextReviewAt ?? undefined,
      },
      reason: decisionOutput.reason,
    }
  }

  const idx = stageIndex(recoveryStage)
  const isFinalStage = idx >= RecoveryPolicies.MAX_STAGE_INDEX

  if (isFinalStage) {
    return {
      actionType: 'escalate',
      goal: 'full_payment',
      confidence: decisionOutput.confidence * 0.8,
      priority: 1,
      timing: { immediate: true },
      reason: `All reminder stages exhausted (${recoveryStage}). Escalating to merchant.`,
    }
  }

  return {
    actionType: 'reminder',
    goal: 'full_payment',
    suggestedAmount: outstanding,
    confidence: decisionOutput.confidence,
    priority: RecoveryPolicies.DEFAULT_PRIORITY,
    timing: { immediate: true },
    reason: `Invoice overdue. Stage: ${recoveryStage}. Standard recovery cycle.`,
  }
}
