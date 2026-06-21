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
//   9. Not in silence period (consecutive ignores)
//  10. Under monthly reminder cap
//  11. Under total reminder cap per invoice
//  12. Engagement not ghosting (cooldown)
//  13. Business hours (9 AM – 8 PM tenant timezone)
//  14. Customer 24h cooldown (never >1 reminder/customer/day)
// ============================================================

import {
  type CanSendReminderInput,
  type CanSendReminderOutput,
  type DecisionRuleResult,
  type Decision,
  TIER_MAX_STAGE,
  ANNOVER_THRESHOLDS,
} from '@billzo/shared'

const REMINDER_STAGE_ORDER = ['t0_soft', 't24_nudge', 't72_strong', 't5_warning']

function stageIndex(stage: string): number {
  return REMINDER_STAGE_ORDER.indexOf(stage)
}

// ============================================================
// canSendReminder — Evaluate all pre-send rules
// ============================================================

export function canSendReminder(input: CanSendReminderInput): CanSendReminderOutput {
  const now = input.now || new Date().toISOString()
  const nowMs = new Date(now).getTime()

  // ── Pre-check: Merchant override (bypass all checks) ──
  let overrideActive = false
  if (input.invoice.overrideSend && input.invoice.overrideAt) {
    const hoursSinceOverride = (nowMs - new Date(input.invoice.overrideAt).getTime()) / 3600000
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
      checksPassed: 1,
      totalChecks: 1,
      nextReviewAt: null,
      merchantInterventionTriggered: false,
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
  const rawPhone = input.customer.phone || ''
  const cleanPhone = rawPhone.replace(/\D/g, '')
  const hasValidPhone = cleanPhone.length >= 10
  const deliveryRate = input.behaviorMetrics?.deliveryRate ?? 1
  const reachable = hasValidPhone && deliveryRate >= 0.3
  const r6: DecisionRuleResult = {
    rule: 'customer_reachable',
    passed: reachable,
    detail: !rawPhone
      ? 'No phone number on file'
      : !hasValidPhone
        ? `Invalid phone format: "${rawPhone}"`
        : deliveryRate < 0.3
          ? `Delivery rate too low: ${(deliveryRate * 100).toFixed(0)}%`
          : `Phone valid, delivery rate ${(deliveryRate * 100).toFixed(0)}%`,
  }
  rules.push(r6)

  // ── Rule 7: No recent manual contact (48h window) ──
  let recentManual = false
  if (input.invoice.manualInteractionAt) {
    const hoursSinceContact = (nowMs - new Date(input.invoice.manualInteractionAt).getTime()) / 3600000
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

  // ── Rule 9: Not in silence period (consecutive ignores) ──
  const T = ANNOVER_THRESHOLDS
  const consecutiveIgnores = input.reminderHistory?.consecutiveIgnores ?? 0
  const lastReminderAt = input.reminderHistory?.lastReminderAt || input.invoice.lastReminderAt
  let inSilencePeriod = false
  let silenceEndAt: string | null = null
  if (consecutiveIgnores >= T.maxConsecutiveIgnores && lastReminderAt) {
    const silenceEndMs = new Date(lastReminderAt).getTime() + T.silenceDaysAfterIgnore * 86400000
    inSilencePeriod = nowMs < silenceEndMs
    silenceEndAt = new Date(silenceEndMs).toISOString()
  }
  const r9: DecisionRuleResult = {
    rule: 'not_in_silence_period',
    passed: !inSilencePeriod,
    detail: inSilencePeriod
      ? `Customer ignored ${consecutiveIgnores} reminders — silence until ${silenceEndAt?.slice(0, 10)}`
      : consecutiveIgnores > 0
        ? `Customer has ${consecutiveIgnores} consecutive ignores (threshold: ${T.maxConsecutiveIgnores})`
        : 'No silence period active',
  }
  rules.push(r9)

  // ── Rule 10: Under monthly reminder cap ──
  const sentThisMonth = input.reminderHistory?.sentThisMonth ?? 0
  const r10: DecisionRuleResult = {
    rule: 'under_monthly_cap',
    passed: sentThisMonth < T.maxRemindersPerMonth,
    detail: sentThisMonth >= T.maxRemindersPerMonth
      ? `Monthly cap reached: ${sentThisMonth}/${T.maxRemindersPerMonth} reminders`
      : `Monthly usage: ${sentThisMonth}/${T.maxRemindersPerMonth}`,
  }
  rules.push(r10)

  // ── Rule 11: Under total reminder cap per invoice ──
  const totalSent = input.reminderHistory?.totalSent ?? 0
  const r11: DecisionRuleResult = {
    rule: 'under_total_cap',
    passed: totalSent < T.maxRemindersPerInvoice,
    detail: totalSent >= T.maxRemindersPerInvoice
      ? `Total cap reached: ${totalSent}/${T.maxRemindersPerInvoice} reminders for this invoice`
      : `Total reminders sent: ${totalSent}/${T.maxRemindersPerInvoice}`,
  }
  rules.push(r11)

  // ── Rule 12: Engagement cooldown (ghosting) ──
  const engagementState = input.customer.engagementState || 'unseen'
  const isGhosting = engagementState === 'ghosting'
  let ghostingCooldown = false
  if (isGhosting && lastReminderAt) {
    const cooldownEndMs = new Date(lastReminderAt).getTime() + T.annoyanceCooldownDays * 86400000
    ghostingCooldown = nowMs < cooldownEndMs
  }
  const r12: DecisionRuleResult = {
    rule: 'engagement_cooldown',
    passed: !ghostingCooldown,
    detail: ghostingCooldown
      ? `Customer is ghosting — cooldown active for ${T.annoyanceCooldownDays}d after last reminder`
      : isGhosting
        ? 'Customer is ghosting but cooldown expired — consider channel switch'
        : `Engagement state: ${engagementState}`,
  }
  rules.push(r12)

  // ── Rule 13: Business hours (9 AM – 8 PM tenant timezone) ──
  const tz = input.timezone || 'Asia/Kolkata'
  const hour = parseInt(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: 'numeric',
      hour12: false,
    }).format(new Date(now)),
    10,
  )
  const inBusinessHours = hour >= 9 && hour < 20
  const r13: DecisionRuleResult = {
    rule: 'business_hours',
    passed: inBusinessHours,
    detail: inBusinessHours
      ? `Current time in ${tz}: ${hour}:00 (within 9–20 window)`
      : `Outside business hours in ${tz}: ${hour}:00 (window: 9–20)`,
  }
  rules.push(r13)

  // ── Rule 14: Customer cooldown — never send more than once per 24h ──
  const hoursSinceLast = input.reminderHistory?.hoursSinceLastCustomerReminder ?? 99
  const customerCooldownOk = hoursSinceLast >= 24
  const r14: DecisionRuleResult = {
    rule: 'customer_cooldown',
    passed: customerCooldownOk,
    detail: customerCooldownOk
      ? hoursSinceLast < 99
        ? `Last customer reminder ${hoursSinceLast.toFixed(0)}h ago (threshold: 24h)`
        : 'No recent reminders sent to this customer'
      : `Customer received a reminder ${hoursSinceLast.toFixed(0)}h ago — 24h cooldown active`,
  }
  rules.push(r14)

  // ── Rule 16: Merchant intervention trigger (3+ consecutive ignores) ──
  const consecutiveIgnores16 = input.reminderHistory?.consecutiveIgnores ?? 0
  const merchantInterventionTriggered = consecutiveIgnores16 >= T.merchantInterventionIgnores
  const r16: DecisionRuleResult = {
    rule: 'merchant_intervention_trigger',
    passed: true,
    detail: merchantInterventionTriggered
      ? `Customer ignored ${consecutiveIgnores16} reminders — merchant intervention recommended`
      : `Consecutive ignores: ${consecutiveIgnores16} (threshold: ${T.merchantInterventionIgnores})`,
  }
  rules.push(r16)

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

  const passedCount = rules.filter(r => r.passed).length
  const totalCount = rules.length

  // Compute next review date from the first failing rule
  const firstBlocking = rules.find(r => !r.passed)
  let nextReviewAt: string | null = null
  if (firstBlocking) {
    switch (firstBlocking.rule) {
      case 'no_active_promise':
        nextReviewAt = input.activePromiseDate || null
        break
      case 'cooldown_expired':
        nextReviewAt = input.invoice.nextRecoveryAt
        break
      case 'not_snoozed':
        nextReviewAt = input.invoice.snoozeUntil
        break
      case 'not_in_silence_period':
        nextReviewAt = silenceEndAt
        break
      case 'customer_cooldown':
        if (lastReminderAt) {
          nextReviewAt = new Date(new Date(lastReminderAt).getTime() + 24 * 3600000).toISOString()
        }
        break
      case 'engagement_cooldown':
        if (lastReminderAt) {
          nextReviewAt = new Date(new Date(lastReminderAt).getTime() + T.annoyanceCooldownDays * 86400000).toISOString()
        }
        break
    }
  }

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
    checksPassed: passedCount,
    totalChecks: totalCount,
    nextReviewAt,
    merchantInterventionTriggered,
  }
}
