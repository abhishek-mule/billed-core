// ============================================================
// Authority Gateway — Sovereignty Policy Engine
// ============================================================
// Pure function: evaluates whether an intent is permitted
// given the active policy bundle.
//
// No side effects.  No DB calls.  No I/O.
// Deterministic — same inputs always produce same result.
// ============================================================

import type {
  IntentEnvelope,
  PolicyBundle,
  SovereigntyRule,
  SovereigntyDecision,
} from './schemas'

/**
 * Evaluate an intent against the active policy bundle.
 *
 * Returns a SovereigntyDecision with:
 *   - allowed: true/false
 *   - matchedRuleIndex: index of the first matching rule, or -1
 *   - violations: human-readable list of why the intent was rejected
 */
export function evaluateSovereignty(
  intent: IntentEnvelope,
  policy: PolicyBundle,
  tenantPlan?: string,
): SovereigntyDecision {
  const violations: string[] = []

  // 1. Match intent_type against rules
  const matchingRules = policy.rules
    .map((rule, index) => ({ rule, index }))
    .filter(({ rule }) => rule.intent === intent.intentType)

  if (matchingRules.length === 0) {
    return {
      allowed: false,
      matchedRuleIndex: -1,
      violations: [`No sovereignty rule found for intent type: ${intent.intentType}`],
    }
  }

  // 2. Evaluate each matching rule (first match wins for rejection)
  for (const { rule, index } of matchingRules) {
    const result = evaluateRule(intent, rule, tenantPlan, index)
    if (result.allowed) {
      return result
    }
    violations.push(...result.violations)
  }

  return {
    allowed: false,
    matchedRuleIndex: matchingRules[0]?.index ?? -1,
    violations,
  }
}

function evaluateRule(
  intent: IntentEnvelope,
  rule: SovereigntyRule,
  tenantPlan?: string,
  ruleIndex: number = -1,
): SovereigntyDecision {
  const violations: string[] = []

  // Check source
  if (!rule.allowedSources.includes(intent.source)) {
    violations.push(
      `Source "${intent.source}" is not allowed for intent "${intent.intentType}". ` +
        `Allowed: [${rule.allowedSources.join(', ')}]`,
    )
  }

  // Check intent version range
  if (rule.minIntentVersion !== undefined && intent.intentVersion < rule.minIntentVersion) {
    violations.push(
      `Intent version ${intent.intentVersion} is below minimum ${rule.minIntentVersion}`,
    )
  }
  if (rule.maxIntentVersion !== undefined && intent.intentVersion > rule.maxIntentVersion) {
    violations.push(
      `Intent version ${intent.intentVersion} exceeds maximum ${rule.maxIntentVersion}`,
    )
  }

  // Check tenant plan
  if (rule.allowedPlans !== undefined && tenantPlan !== undefined) {
    if (!rule.allowedPlans.includes(tenantPlan)) {
      violations.push(
        `Tenant plan "${tenantPlan}" is not allowed for intent "${intent.intentType}". ` +
          `Allowed: [${rule.allowedPlans.join(', ')}]`,
      )
    }
  }

  // Check required capabilities (actor-level)
  if (rule.requiredCapabilities !== undefined && rule.requiredCapabilities.length > 0) {
    // Actor capabilities are not yet implemented in v1.
    // This is a placeholder for future capability-based auth.
    // In v1, requiredCapabilities are informational only.
  }

  return {
    allowed: violations.length === 0,
    matchedRuleIndex: ruleIndex,
    violations,
  }
}

/**
 * Check whether a single rate limit category has been exceeded.
 * Pure function — caller is responsible for providing current counts.
 *
 * This is intentionally separated from evaluateSovereignty because
 * rate limit state comes from Redis/DB, not the policy bundle alone.
 */
export function checkRateLimit(
  rule: SovereigntyRule,
  current: {
    readonly perSecond?: number
    readonly perMinute?: number
    readonly perHour?: number
    readonly perTenantPerDay?: number
  },
): string[] {
  const violations: string[] = []

  if (rule.rateLimit === undefined) return violations

  if (
    rule.rateLimit.perSecond !== undefined &&
    current.perSecond !== undefined &&
    current.perSecond >= rule.rateLimit.perSecond
  ) {
    violations.push(`Rate limit exceeded: ${current.perSecond}/${rule.rateLimit.perSecond} per second`)
  }

  if (
    rule.rateLimit.perMinute !== undefined &&
    current.perMinute !== undefined &&
    current.perMinute >= rule.rateLimit.perMinute
  ) {
    violations.push(`Rate limit exceeded: ${current.perMinute}/${rule.rateLimit.perMinute} per minute`)
  }

  if (
    rule.rateLimit.perHour !== undefined &&
    current.perHour !== undefined &&
    current.perHour >= rule.rateLimit.perHour
  ) {
    violations.push(`Rate limit exceeded: ${current.perHour}/${rule.rateLimit.perHour} per hour`)
  }

  if (
    rule.rateLimit.perTenantPerDay !== undefined &&
    current.perTenantPerDay !== undefined &&
    current.perTenantPerDay >= rule.rateLimit.perTenantPerDay
  ) {
    violations.push(
      `Rate limit exceeded: ${current.perTenantPerDay}/${rule.rateLimit.perTenantPerDay} per tenant per day`,
    )
  }

  return violations
}


