// Authority-enforced gates for automatic recovery.
// Invariant: if a tenant has no auto_recovery entitlement OR has switched
// automatic recovery OFF, no *automatic* (source='system') collection_action
// may be planned or dispatched. Manual merchant actions (source='merchant')
// are never blocked by these gates.

import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import { getPlan, hasFeature } from '@/lib/billzo/plan-limits'

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

  const entitled = hasFeature(getPlan(data?.plan), 'auto_recovery')
  const enabled = data?.auto_recovery_enabled ?? true
  return { entitled, enabled, blocked: !entitled || !enabled }
}

export function blockedReason(gate: AutoRecoveryGate): string | null {
  if (!gate.entitled) return 'plan_requires_auto_recovery'
  if (!gate.enabled) return 'auto_recovery_disabled'
  return null
}

/**
 * Cancel all pending automatic (source='system') actions for a tenant.
 * Used when a merchant disables Auto Recovery so previously-scheduled
 * actions can never escape the new OFF state.
 */
export async function cancelAutomaticActionsForTenant(
  tenantId: string,
  reason: string = 'auto_recovery_disabled',
): Promise<number> {
  const now = new Date().toISOString()
  const { data: actions } = await supabaseAdmin
    .from('collection_actions')
    .select('id, status')
    .eq('tenant_id', tenantId)
    .eq('source', 'system')
    .in('status', ['scheduled', 'processing', 'in_progress'])

  if (!actions || actions.length === 0) return 0

  let cancelled = 0
  for (const a of actions) {
    await supabaseAdmin
      .from('collection_actions')
      .update({ status: 'cancelled', cancelled_at: now, cancel_reason: reason, updated_at: now })
      .eq('id', a.id)
    try {
      await supabaseAdmin.from('collection_action_events').insert({
        action_id: a.id,
        event_type: 'cancelled',
        from_status: a.status,
        to_status: 'cancelled',
        payload: { reason },
      })
    } catch {
      /* non-fatal audit write */
    }
    cancelled++
  }
  return cancelled
}