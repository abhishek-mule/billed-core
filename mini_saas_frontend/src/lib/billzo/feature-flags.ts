import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import { getPlan, FEATURES, type Feature, type PlanType } from '@/lib/billzo/plan-limits'

export type SubscriptionState =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'paused'
  | 'cancelled'
  | 'expired'
  | 'incomplete'

export interface TenantEntitlement {
  tenantId: string
  planCode: PlanType
  planVersion: number
  subscriptionState: SubscriptionState
  isPaid: boolean
  features: Feature[]
}

const PAID_STATES: SubscriptionState[] = ['trialing', 'active', 'past_due']

/**
 * Load the tenant's entitlement: plan code, version, subscription state, and
 * the resolved feature set (plan default merged with per-tenant flag overrides).
 *
 * Reads are served from `tenants` (denormalized mirror kept in sync by the
 * billing worker) so this stays cheap and synchronous with request handling.
 * The authoritative subscription lives in `subscriptions`.
 */
export async function getEntitlement(tenantId: string): Promise<TenantEntitlement | null> {
  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('plan, plan_version, subscription_state')
    .eq('id', tenantId)
    .single()

  if (!tenant) return null

  const planCode = getPlan(tenant.plan)
  const planVersion = tenant.plan_version ?? 1
  const subscriptionState = (tenant.subscription_state ?? 'trialing') as SubscriptionState
  const isPaid = PAID_STATES.includes(subscriptionState) && planCode !== 'starter'

  let features = [...(FEATURES[planCode] ?? [])] as Feature[]

  // Apply per-tenant flag overrides (beta/promo/lifetime) — these win.
  const { data: flags } = await supabaseAdmin
    .from('feature_flags')
    .select('flag, enabled, expires_at')
    .eq('tenant_id', tenantId)

  const now = Date.now()
  for (const f of flags ?? []) {
    if (f.expires_at && new Date(f.expires_at).getTime() < now) continue
    const key = f.flag as Feature
    if (f.enabled && !features.includes(key)) features.push(key)
    if (!f.enabled) features = features.filter((x) => x !== key)
  }

  return { tenantId, planCode, planVersion, subscriptionState, isPaid, features }
}

/**
 * Can the tenant use `feature` right now?
 * Pure entitlement check — no quota metering (quotas use checkQuota).
 */
export async function canUse(tenantId: string, feature: Feature): Promise<boolean> {
  const ent = await getEntitlement(tenantId)
  if (!ent) return false
  return ent.features.includes(feature)
}

/**
 * Product capability → underlying feature(s). The UI asks `can('AI_RECOVERY')`
 * and never references a plan name, so pricing logic never leaks into the UI.
 */
export type Capability =
  | 'MANUAL_REMINDERS'
  | 'AUTO_RECOVERY'
  | 'RECOVERY_QUEUE'
  | 'PROMISE_TRACKING'
  | 'CASHFLOW_FORECAST'
  | 'ANALYTICS'
  | 'EXPORTS'
  | 'API'
  | 'MULTI_BRANCH'

const CAPABILITY_FEATURES: Record<Capability, Feature> = {
  MANUAL_REMINDERS: 'manual_reminders',
  AUTO_RECOVERY: 'auto_recovery',
  RECOVERY_QUEUE: 'recovery_queue',
  PROMISE_TRACKING: 'promise_tracking',
  CASHFLOW_FORECAST: 'cashflow_forecast',
  ANALYTICS: 'advanced_analytics',
  EXPORTS: 'exports',
  API: 'api' as Feature,
  MULTI_BRANCH: 'multi_branch' as Feature,
}

/** Returns the resolved capability set (true/false per capability) for a tenant. */
export async function getCapabilities(tenantId: string): Promise<Record<Capability, boolean>> {
  const ent = await getEntitlement(tenantId)
  const out = {} as Record<Capability, boolean>
  for (const cap of Object.keys(CAPABILITY_FEATURES) as Capability[]) {
    out[cap] = ent ? ent.features.includes(CAPABILITY_FEATURES[cap]) : false
  }
  return out
}

/** UI entry point: `await can(tenantId, 'AI_RECOVERY')`. No plan names involved. */
export async function can(tenantId: string, capability: Capability): Promise<boolean> {
  const ent = await getEntitlement(tenantId)
  if (!ent) return false
  return ent.features.includes(CAPABILITY_FEATURES[capability])
}

export interface QuotaCheck {
  allowed: boolean
  used: number
  limit: number
  unlimited: boolean
  remaining: number
}

/**
 * Check a numeric monthly quota (e.g. reminders) using `tenant_usage`
 * (incremented by the billing worker, never synchronously).
 */
export async function checkQuota(
  tenantId: string,
  metric: 'reminders_sent' | 'whatsapp_messages' | 'invoices_created' | 'api_calls',
  limit: number,
): Promise<QuotaCheck> {
  if (limit === -1) {
    return { allowed: true, used: 0, limit: -1, unlimited: true, remaining: -1 }
  }
  const month = currentMonth()
  const { data: usage } = await supabaseAdmin
    .from('tenant_usage')
    .select(metric)
    .eq('tenant_id', tenantId)
    .eq('month', month)
    .single()

  const used = ((usage as Record<string, number> | null)?.[metric]) ?? 0
  return {
    allowed: used < limit,
    used,
    limit,
    unlimited: false,
    remaining: Math.max(0, limit - used),
  }
}

/** Record a usage event; the worker increments tenant_usage from this. */
export async function emitUsageEvent(
  tenantId: string,
  metric: string,
  amount = 1,
): Promise<void> {
  const { createBillingUsageEvent } = await import('@/lib/billzo/billing-events')
  await createBillingUsageEvent(tenantId, metric, amount)
}

function currentMonth(): string {
  const d = new Date()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}
