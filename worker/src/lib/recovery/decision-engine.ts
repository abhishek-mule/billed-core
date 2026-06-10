// ============================================================
// decision-engine.ts — Pre-Send Checklist
// ============================================================
//
// Pure function. No database access. No side effects.
// Every invocation produces a complete audit trail.
//
// Checks (in order):
//   0. Merchant override — if set within 24h, skip all checks
//   1. Outstanding > 0
//   2. Not disputed
//   3. No active promise
//   4. Not snoozed
//   5. Cooldown expired
//   6. Customer reachable
//   7. No recent manual contact (48h window)
//   8. Customer tier permits escalation stage
// ============================================================

import {
  type CanSendReminderInput,
  type CanSendReminderOutput,
  type DecisionRuleResult,
  type Decision,
  TIER_MAX_STAGE,
} from '@billzo/shared'

const REMINDER_STAGE_ORDER = ['t0_soft', 't24_nudge', 't72_strong', 't5_warning']

function stageIndex(stage: string): number {
  return REMINDER_STAGE_ORDER.indexOf(stage)
}

// ============================================================
// canSendReminder — Evaluate all 8 pre-send rules
// ============================================================

export function canSendReminder(input: CanSendReminderInput): CanSendReminderOutput {
  const now = input.now || new Date().toISOString()

  // ── Pre-check: Merchant override (bypass all checks) ──
  let overrideActive = false
  if (input.invoice.overrideSend && input.invoice.overrideAt) {
    const hoursSinceOverride = (new Date(now).getTime() - new Date(input.invoice.overrideAt).getTime()) / 3600000
    overrideActive = hoursSinceOverride < 24
  }

  if (overrideActive) {
    return {
      allowed: true,
      decision: 'send',
      reason: `Merchant override: ${input.invoice.overrideReason || 'approved'}`,
      confidence: 1.0,
      rules: [{
        rule: 'merchant_override',
        passed: true,
        detail: `Merchant override active (reason: ${input.invoice.overrideReason || 'not specified'})`,
        override: true,
        overrideReason: input.invoice.overrideReason || undefined,
      }],
      rulesSnapshot: { merchant_override: true },
    }
  }

  const rules: DecisionRuleResult[] = []

  // ── Rule 1: Outstanding > 0 ──
  const r1: DecisionRuleResult = {
    rule: 'outstanding_positive',
    passed: input.invoice.outstanding > 0,
    detail: input.invoice.outstanding > 0
      ? `Outstanding: ${input.invoice.outstanding}`
      : `Outstanding is zero (total=${input.invoice.total})`,
  }
  rules.push(r1)

  // ── Rule 2: Not disputed ──
  const r2: DecisionRuleResult = {
    rule: 'not_disputed',
    passed: !input.invoice.isDisputed,
    detail: input.invoice.isDisputed ? 'Invoice is marked as disputed' : 'Not disputed',
  }
  rules.push(r2)

  // ── Rule 3: No active promise ──
  let activePromise = false
  if (input.activePromiseDate) {
    const promiseDate = new Date(input.activePromiseDate)
    activePromise = promiseDate > new Date(now)
  }
  const r3: DecisionRuleResult = {
    rule: 'no_active_promise',
    passed: !activePromise,
    detail: activePromise
      ? `Active promise until ${input.activePromiseDate}`
      : 'No active promise',
  }
  rules.push(r3)

  // ── Rule 4: Not snoozed ──
  let isSnoozed = input.invoice.isSnoozed
  if (input.invoice.snoozeUntil && new Date(input.invoice.snoozeUntil) > new Date(now)) {
    isSnoozed = true
  }
  const r4: DecisionRuleResult = {
    rule: 'not_snoozed',
    passed: !isSnoozed,
    detail: isSnoozed
      ? `Snoozed until ${input.invoice.snoozeUntil || 'indefinitely'}`
      : 'Not snoozed',
  }
  rules.push(r4)

  // ── Rule 5: Cooldown expired ──
  let cooldownActive = false
  if (input.invoice.nextRecoveryAt) {
    cooldownActive = new Date(input.invoice.nextRecoveryAt) > new Date(now)
  }
  const r5: DecisionRuleResult = {
    rule: 'cooldown_expired',
    passed: !cooldownActive,
    detail: cooldownActive
      ? `Cooldown active until ${input.invoice.nextRecoveryAt}`
      : 'Cooldown expired',
  }
  rules.push(r5)

  // ── Rule 6: Customer reachable ──
  const hasPhone = !!input.customer.phone
  const deliveryRate = input.behaviorMetrics?.deliveryRate ?? 1
  const reachable = hasPhone && deliveryRate >= 0.3
  const r6: DecisionRuleResult = {
    rule: 'customer_reachable',
    passed: reachable,
    detail: !hasPhone
      ? 'No phone number on file'
      : deliveryRate < 0.3
        ? `Delivery rate too low: ${(deliveryRate * 100).toFixed(0)}%`
        : `Phone exists, delivery rate ${(deliveryRate * 100).toFixed(0)}%`,
  }
  rules.push(r6)

  // ── Rule 7: No recent manual contact (48h window) ──
  let recentManual = false
  if (input.invoice.manualInteractionAt) {
    const hoursSinceContact = (new Date(now).getTime() - new Date(input.invoice.manualInteractionAt).getTime()) / 3600000
    recentManual = hoursSinceContact < 48
  }
  const r7: DecisionRuleResult = {
    rule: 'no_recent_manual_contact',
    passed: !recentManual,
    detail: recentManual
      ? `Merchant manually contacted within 48h`
      : 'No recent manual contact',
  }
  rules.push(r7)

  // ── Rule 8: Customer tier permits escalation stage ──
  const maxStage = TIER_MAX_STAGE[input.customer.customerTier] || 't5_warning'
  const currentStageIdx = stageIndex(input.invoice.recoveryStage)
  const maxStageIdx = stageIndex(maxStage)
  const tierPermits = currentStageIdx <= maxStageIdx
  const r8: DecisionRuleResult = {
    rule: 'tier_permits_escalation',
    passed: tierPermits,
    detail: tierPermits
      ? `Tier ${input.customer.customerTier} permits up to ${maxStage} (current: ${input.invoice.recoveryStage})`
      : `Tier ${input.customer.customerTier} max stage is ${maxStage}, but current is ${input.invoice.recoveryStage}`,
  }
  rules.push(r8)

  // ── Aggregate ──
  const allPassed = rules.every(r => r.passed)
  const blockedBy = rules.find(r => !r.passed)

  // Determine decision
  let decision: Decision = 'send'
  let reason = 'All checks passed'

  if (!allPassed && blockedBy) {
    if (input.customer.automationMode === 'manual') {
      decision = 'pending_approval'
      reason = blockedBy.detail
    } else {
      decision = 'block'
      reason = blockedBy.detail
    }
  }

  // Confidence: 1.0 if all pass, penalized per failing rule
  const failingCount = rules.filter(r => !r.passed).length
  const confidence = allPassed ? 1.0 : Math.max(0.1, 1.0 - failingCount * 0.15)

  const rulesSnapshot: Record<string, boolean> = {
    merchant_override: false,
  }
  for (const r of rules) {
    rulesSnapshot[r.rule] = r.passed
  }

  return {
    allowed: allPassed,
    decision,
    reason,
    confidence,
    rules,
    rulesSnapshot,
  }
}
