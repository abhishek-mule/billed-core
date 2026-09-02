import { supabaseAdmin } from '../billzo/supabase-admin'
import { attributabilityOf } from './attribution-truth'

/**
 * Phase 1.5 C0 — call outcome ledger.
 *
 * A merchant-completed call is recorded as a call_completed recovery_outcome.
 * Explicit attempt identity (the collection_action the call responded to)
 * resolves to VERIFIED; without it the outcome is recorded UNKNOWN. Causality
 * is never guessed from timestamps or last-touch.
 *
 * Write-once (D5): the outbox event id is the evidence receipt. A retried
 * event must resolve to the same evidence row and can never re-attribute an
 * existing verified link.
 */
export async function recordCallOutcome(input: {
  tenantId: string
  attemptId?: string | null
  customerId?: string | null
  invoiceId?: string | null
  occurredAt: string
  /** Outbox event id — acts as the evidence receipt for retry-idempotency. */
  evidenceId?: string | null
}): Promise<{ attemptId: string | null; attributionStatus: 'verified' | 'unknown' }> {
  const attemptId = typeof input.attemptId === 'string' && input.attemptId ? input.attemptId : null
  const attribution = attributabilityOf(attemptId)

  const { data: existing } = await supabaseAdmin
    .from('recovery_outcomes')
    .select('id')
    .eq('outcome_type', 'call_completed')
    .eq('provider_message_id', input.evidenceId || '__none__')
    .limit(1)
    .maybeSingle()
  if (existing) return { attemptId, attributionStatus: attribution.attribution_status }

  // authority:exempt append_only_observability — immutable recovery evidence ledger
  await supabaseAdmin.from('recovery_outcomes').insert({
    tenant_id: input.tenantId,
    recovery_attempt_id: attemptId,
    outcome_type: 'call_completed',
    outcome_at: input.occurredAt,
    invoice_id: input.invoiceId ?? null,
    customer_id: input.customerId || null,
    attribution_status: attribution.attribution_status,
    attribution_method: attribution.attribution_method,
    confidence_score: attribution.confidence_score,
    provider_message_id: input.evidenceId || null,
    metadata: { source: 'customer.called' },
  })

  return { attemptId, attributionStatus: attribution.attribution_status }
}