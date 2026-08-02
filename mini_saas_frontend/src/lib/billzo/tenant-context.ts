import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import { getEntitlement, type TenantEntitlement } from '@/lib/billzo/feature-flags'
import type { Feature, PlanType } from '@/lib/billzo/plan-limits'
import { findSessionsByUserId } from '@/lib/billzo/auth-store'

export interface MembershipInfo {
  tenantId?: string
  merchantName?: string
  membershipRole?: string
}

export interface TenantContext {
  tenantId: string
  userId: string
  merchantId?: string
  membershipRole?: string
  plan: PlanType
  planVersion: number
  subscriptionState: TenantEntitlement['subscriptionState']
  isPaid: boolean
  features: Feature[]
  permissions: string[]
}

/**
 * Resolve the user's active tenant. `tenant_memberships` is the authoritative
 * source — it always wins. Prior sessions (Redis) are only a fallback for
 * users whose membership row has not been created yet.
 */
export async function resolveTenantForUser(userId: string): Promise<MembershipInfo> {
  const { data: membership } = await supabaseAdmin
    .from('tenant_memberships')
    .select('tenant_id, role, tenants(id, name)')
    .eq('user_id', userId)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()

  if (membership) {
    return {
      tenantId: membership.tenant_id,
      merchantName: (membership as any).tenants?.name || undefined,
      membershipRole: membership.role || 'owner',
    }
  }

  try {
    const sessions = await findSessionsByUserId(userId)
    const withTenant = sessions.find((s) => s.tenantId)
    if (withTenant?.tenantId) return { tenantId: withTenant.tenantId }
  } catch {
    // non-critical — no cached session available
  }

  return {}
}

/**
 * Build a fully-resolved TenantContext: membership + entitlement merged into
 * a single object downstream code can accept instead of bare `tenantId`.
 */
export async function buildTenantContext(
  userId: string,
  tenantId: string,
  membership?: MembershipInfo,
): Promise<TenantContext> {
  const ent = await getEntitlement(tenantId)
  const role = membership?.membershipRole
  const features = ent?.features ?? []

  return {
    tenantId,
    userId,
    merchantId: membership?.tenantId || tenantId,
    membershipRole: role,
    plan: ent?.planCode ?? 'starter',
    planVersion: ent?.planVersion ?? 1,
    subscriptionState: ent?.subscriptionState ?? 'trialing',
    isPaid: ent?.isPaid ?? false,
    features,
    permissions: derivePermissions(role, features),
  }
}

function derivePermissions(role: string | undefined, features: Feature[]): string[] {
  const perms = new Set<string>()
  if (role === 'owner' || role === 'admin') perms.add('tenant.manage')
  if (role) perms.add('tenant.access')
  if (features.includes('manual_reminders')) perms.add('reminders.send')
  if (features.includes('auto_recovery')) perms.add('recovery.automate')
  if (features.includes('recovery_queue')) perms.add('recovery.queue')
  if (features.includes('api')) perms.add('api.access')
  return Array.from(perms)
}
