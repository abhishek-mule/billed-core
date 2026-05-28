import { evaluateSovereignty, checkRateLimit } from './sovereignty'
import { semanticHash } from './hashing'
import { compileDecisionGraph, type DecisionGraphInput } from './decision-graph'
import type {
  IntentEnvelope,
  PolicyBundle,
  CapabilityProvider,
  SovereigntyRule,
  AuthorityResult,
} from './schemas'

export interface RateLimitStore {
  getCurrentCounts: (rule: SovereigntyRule, tenantId: string) => Promise<{
    perSecond?: number
    perMinute?: number
    perHour?: number
    perTenantPerDay?: number
  }>
}

export interface AuthorityCoreConfig {
  readonly policy: PolicyBundle
  readonly capabilities: readonly CapabilityProvider[]
  readonly rateLimitStore: RateLimitStore
  readonly tenantPlanLookup: (tenantId: string) => Promise<string | undefined>
}

export async function evaluate(
  intent: IntentEnvelope,
  config: AuthorityCoreConfig,
): Promise<AuthorityResult> {
  const tenantPlan = await config.tenantPlanLookup(intent.tenantId)

  const sovereignty = evaluateSovereignty(intent, config.policy, tenantPlan)

  const dedupHash = semanticHash(intent.payload, (p) => p)
  const dedupOnMatch = detectDedupMatch(intent, dedupHash)

  const graphInput: DecisionGraphInput = {
    intent,
    policy: config.policy,
    sovereignty,
    capabilities: config.capabilities,
    semanticalDedupHash: dedupHash,
    dedupOnMatch,
  }

  const { decision, plan } = compileDecisionGraph(graphInput)

  if (decision.outcome === 'rejected' || !plan) {
    return {
      accepted: false,
      intentId: intent.intentId,
      decisionId: null,
      decision,
      error: decision.decisionGraph
        .filter((n) => !n.passed)
        .map((n) => n.reason)
        .join('; '),
    }
  }

  return {
    accepted: true,
    intentId: intent.intentId,
    decisionId: plan.planHash,
    decision,
  }
}

function detectDedupMatch(
  _intent: IntentEnvelope,
  _dedupHash: string,
): 'reject' | 'require_approval' | null {
  return null
}
