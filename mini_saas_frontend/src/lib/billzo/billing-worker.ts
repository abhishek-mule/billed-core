// authority:exempt ephemeral_operational_state — billing outbox worker
import { supabaseAdmin } from './supabase-admin'
import {
  pollOutboxEvents,
  markEventProcessing,
  markEventCompleted,
  markEventFailed,
} from './outbox'

const MAX_ATTEMPTS = 5

/**
 * Process one batch of billing-related outbox events.
 * Types handled: billing.usage, billing.subscription_change.
 * Returns the number of events processed.
 */
export async function drainBillingOutbox(limit = 50): Promise<number> {
  const events = await pollOutboxEvents(limit)
  const billing = events.filter(
    (e) => e.type === 'billing.usage' || e.type === 'billing.subscription_change',
  )

  for (const ev of billing) {
    await markEventProcessing(ev.id)
    try {
      if (ev.type === 'billing.usage') {
        await applyUsage(ev.payload as { metric: string; amount: number }, ev.tenantId)
      } else if (ev.type === 'billing.subscription_change') {
        await applySubscriptionChange(ev.payload as any, ev.tenantId)
      }
      await markEventCompleted(ev.id)
    } catch (err) {
      console.error('[BillingWorker] failed event', ev.id, err)
      await markEventFailed(ev.id, ev.attempts + 1, MAX_ATTEMPTS)
    }
  }
  return billing.length
}

async function applyUsage(
  payload: { metric: string; amount: number },
  tenantId: string,
): Promise<void> {
  if (!payload?.metric) return
  const month = currentMonth()
  const amount = payload.amount ?? 1

  // Upsert monthly counter (increment atomically via RPC-free update).
  const { data: existing } = await supabaseAdmin
    .from('tenant_usage')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('month', month)
    .single()

  if (!existing) {
    const row: Record<string, unknown> = { tenant_id: tenantId, month, updated_at: new Date().toISOString() }
    row[payload.metric] = amount
    await supabaseAdmin.from('tenant_usage').insert(row)
    return
  }

  const current = (existing[payload.metric] as number) ?? 0
  await supabaseAdmin
    .from('tenant_usage')
    .update({ [payload.metric]: current + amount, updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('month', month)
}

async function applySubscriptionChange(
  payload: {
    subscriptionId?: string
    fromState?: string
    toState: string
    fromPlanCode?: string
    toPlanCode?: string
    reason: string
    actor?: string
  },
  tenantId: string,
): Promise<void> {
  const { subscriptionId, fromState, toState, fromPlanCode, toPlanCode, reason, actor = 'system' } = payload

  // 1. Update subscriptions row if present
  if (subscriptionId) {
    await supabaseAdmin
      .from('subscriptions')
      .update({ status: toState, updated_at: new Date().toISOString() })
      .eq('id', subscriptionId)
      .eq('tenant_id', tenantId)
  }

  // 2. Mirror onto tenants (denormalized, source of truth for reads)
  const tenantUpdate: Record<string, unknown> = { subscription_state: toState }
  if (toPlanCode) {
    tenantUpdate.plan = toPlanCode
  }
  await supabaseAdmin.from('tenants').update(tenantUpdate).eq('id', tenantId)

  // 3. Audit history
  await supabaseAdmin.from('subscription_history').insert({
    tenant_id: tenantId,
    subscription_id: subscriptionId ?? null,
    from_state: fromState ?? null,
    to_state: toState,
    from_plan_code: fromPlanCode ?? null,
    to_plan_code: toPlanCode ?? null,
    reason,
    actor,
  })
}

function currentMonth(): string {
  const d = new Date()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}
