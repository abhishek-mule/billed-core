// authority:exempt ephemeral_operational_state — billing event + outbox helpers
import { supabaseAdmin } from './supabase-admin'
import { writeOutboxEvent } from './outbox'

/**
 * Append a raw provider billing event (immutable log). This is the single
 * entry point for webhook + verification events before they fan out to the
 * outbox for the worker to apply.
 */
export async function recordBillingEvent(params: {
  tenantId: string | null
  provider?: string
  eventType: string
  providerEventId?: string
  rawPayload: unknown
}): Promise<string> {
  const { tenantId, provider = 'razorpay', eventType, providerEventId, rawPayload } = params

  const { data, error } = await supabaseAdmin
    .from('billing_events')
    .insert({
      tenant_id: tenantId,
      provider,
      event_type: eventType,
      provider_event_id: providerEventId,
      raw_payload: rawPayload as any,
    })
    .select('id')
    .single()

  if (error) {
    // 23505 = unique_violation on provider_event_id → duplicate webhook. Safe to ignore.
    if (error.code === '23505') {
      console.warn('[BillingEvents] Duplicate provider event ignored:', providerEventId)
      return ''
    }
    throw new Error(`billing_events insert failed: ${error.message}`)
  }
  return data.id
}

/**
 * Publish a usage event to the outbox. The billing worker increments the
 * monthly `tenant_usage` counters from these — never synchronously in a
 * request handler.
 */
export async function createBillingUsageEvent(
  tenantId: string,
  metric: string,
  amount = 1,
): Promise<string> {
  return writeOutboxEvent({
    type: 'billing.usage',
    tenantId,
    entityId: tenantId,
    payload: { metric, amount },
    idempotencyKey: `${tenantId}:${metric}:${Date.now()}`,
  })
}

/**
 * Publish a subscription-state change to the outbox so the worker can apply
 * it to `subscriptions` + `subscription_history` + mirror `tenants`.
 */
export async function publishSubscriptionChange(params: {
  tenantId: string
  subscriptionId?: string
  fromState?: string
  toState: string
  fromPlanCode?: string
  toPlanCode?: string
  reason: string
  actor?: string
  correlationId?: string
  idempotencyKey?: string
}): Promise<string> {
  return writeOutboxEvent({
    type: 'billing.subscription_change',
    tenantId: params.tenantId,
    entityId: params.subscriptionId ?? params.tenantId,
    payload: {
      subscriptionId: params.subscriptionId,
      fromState: params.fromState,
      toState: params.toState,
      fromPlanCode: params.fromPlanCode,
      toPlanCode: params.toPlanCode,
      reason: params.reason,
      actor: params.actor ?? 'system',
    },
    correlationId: params.correlationId,
    idempotencyKey: params.idempotencyKey,
  })
}
