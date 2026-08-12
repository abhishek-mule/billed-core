// Authority-enforced gates for automatic recovery (worker side).
// Mirrors mini_saas_frontend/src/lib/recovery/enforcement.ts so the worker's
// scheduler/dispatcher enforce the same invariant:
//   automatic recovery OFF or no plan entitlement ⇒ no source='system' action
//   may be enqueued or dispatched. Manual (source='merchant') actions never blocked.

import { supabaseAdmin } from '../billzo/supabase-admin'

const AUTO_RECOVERY_PLANS = new Set(['pro', 'business', 'enterprise'])

export interface AutoRecoveryGate {
  entitled: boolean
  enabled: boolean
  blocked: boolean
}

export async function getAutoRecoveryGate(tenantId: string): Promise<AutoRecoveryGate> {
  const { data } = await supabaseAdmin
    .from('tenants')
    .select('plan, auto_recovery_enabled')
    .eq('id', tenantId)
    .maybeSingle()

  const plan = String(data?.plan || '').toLowerCase()
  const entitled = AUTO_RECOVERY_PLANS.has(plan)
  const enabled = data?.auto_recovery_enabled ?? true
  return { entitled, enabled, blocked: !entitled || !enabled }
}

export function blockedReason(gate: AutoRecoveryGate): string {
  return gate.entitled ? 'auto_recovery_disabled' : 'plan_requires_auto_recovery'
}