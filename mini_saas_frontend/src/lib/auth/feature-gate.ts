import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import { type Feature, type PlanType } from '@/lib/billzo/plan-limits'
import { getEntitlement } from '@/lib/billzo/feature-flags'

export interface FeatureGateResult {
  allowed: boolean
  /**
   * Machine-readable, unique per rejection. Every gate denial returns a
   * distinct code so clients can branch without string-matching prose.
   */
  code?: 'TENANT_NOT_FOUND' | 'FEATURE_LOCKED' | 'TRIAL_EXPIRED' | 'TRIAL_ALREADY_USED' | 'TRIAL_IN_PROGRESS'
  /** Human-readable explanation for the merchant. */
  message?: string
  /** @deprecated use `code` */
  error?: 'FEATURE_LOCKED' | 'TRIAL_EXPIRED' | 'TRIAL_ALREADY_USED' | 'TRIAL_IN_PROGRESS' | 'TENANT_NOT_FOUND'
  upgradeTo?: PlanType
  isTrial?: boolean
}

const GATE_MESSAGES: Record<NonNullable<FeatureGateResult['code']>, string> = {
  TENANT_NOT_FOUND: 'Tenant not found or session expired. Please sign in again.',
  FEATURE_LOCKED: 'This feature is not available on your current plan.',
  TRIAL_EXPIRED: 'Your free trial has expired. Upgrade to continue.',
  TRIAL_ALREADY_USED: 'You have already used your free trial.',
  TRIAL_IN_PROGRESS: 'Your free trial is already running. Please wait for it to complete.',
}

function deny(
  code: NonNullable<FeatureGateResult['code']>,
  extra?: Pick<FeatureGateResult, 'upgradeTo' | 'isTrial'>,
): FeatureGateResult {
  return { allowed: false, code, message: GATE_MESSAGES[code], error: code, ...extra }
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'

const TRIAL_FEATURES: readonly string[] = ['free_recovery_trial']

/**
 * Check whether a tenant can access a named feature.
 *
 * - Plan-based features (auto_recovery, recovery_queue, …) are checked via
 *   the permanent FEATURES map.
 * - Promotions (free_recovery_trial) are checked separately via the
 *   feature_trials table and the tenant's 14-day window from signup.
 *
 * Mutations (POST, PUT, DELETE, PATCH) that target a trial feature also
 * verify the promotion eligibility. Read-requests (GET) for trial features
 * are never blocked here — they should be gated elsewhere (e.g. by the
 * route handler returning a preview response).
 */
export async function requireFeature(
  tenantId: string,
  feature: string,
  method: HttpMethod = 'GET',
): Promise<FeatureGateResult> {
  const ent = await getEntitlement(tenantId)
  if (!ent) {
    return deny('TENANT_NOT_FOUND')
  }

  const plan = ent.planCode

  // 1. Permanent feature entitlement (plan + overrides resolved by FeatureService)
  if (TRIAL_FEATURES.includes(feature)) {
    // trial features are promotions — handled below
  } else if (ent.features.includes(feature as Feature)) {
    return { allowed: true }
  } else {
    return deny('FEATURE_LOCKED', { upgradeTo: plan === 'starter' ? 'pro' : 'business' })
  }

  // 2. Promotions — only checked on mutating requests
  if (!TRIAL_FEATURES.includes(feature)) {
    return deny('FEATURE_LOCKED', { upgradeTo: plan === 'starter' ? 'pro' : 'business' })
  }

  if (method === 'GET') {
    // Read-only access to trial data is never blocked at the gate level;
    // routes may return previews instead of full data.
    return { allowed: true }
  }

  // 3. free_recovery_trial promotion
  return checkTrialEligibility(tenantId, plan)
}

async function checkTrialEligibility(
  tenantId: string,
  plan: PlanType,
): Promise<FeatureGateResult> {
  // If the tenant is already on a paid plan they don't need the trial
  if (plan !== 'starter') {
    return { allowed: true, isTrial: false }
  }

  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('created_at')
    .eq('id', tenantId)
    .single()

  if (!tenant?.created_at) return { allowed: true, isTrial: true }

  // 14-day window from tenant creation
  const daysSinceSignup = differenceInDays(new Date(), new Date(tenant.created_at))
  if (daysSinceSignup > 14) {
    return deny('TRIAL_EXPIRED')
  }

  // Check the feature_trials table
  const { data: trial } = await supabaseAdmin
    .from('feature_trials')
    .select('status, started_at')
    .eq('tenant_id', tenantId)
    .eq('feature', 'free_recovery_trial')
    .single()

  if (!trial) {
    return { allowed: true, isTrial: true }
  }

  if (trial.status === 'completed') {
    return deny('TRIAL_ALREADY_USED')
  }

  // running — allow retry only if > 1 hour elapsed (worker likely crashed)
  const elapsed = Date.now() - new Date(trial.started_at).getTime()
  if (elapsed < 60 * 60 * 1000) {
    return deny('TRIAL_IN_PROGRESS')
  }

  // Worker appears to have crashed — allow retry
  return { allowed: true, isTrial: true }
}

function differenceInDays(a: Date, b: Date): number {
  const ms = a.getTime() - b.getTime()
  return Math.floor(ms / (1000 * 60 * 60 * 24))
}
