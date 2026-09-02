import { supabaseAdmin } from '../billzo/supabase-admin'
import { attributabilityOf } from './attribution-truth'

/**
 * Phase 1.5 B3/D — payment outcome ledger.
 *
 * Payment evidence is recorded as a recovery_outcomes 'payment' row, attributed
 * ONLY through the explicit recoveryAttemptId the caller passes. A payment with
 * no identity is recorded UNKNOWN — the provider payment id is stored as
 * evidence but is NEVER used to infer an attempt (no last-touch, no timestamp
 * proximity, no "pick latest" ambiguity resolution).
 *
 * Write-once (D5): the first payment outcome for a paymentId wins. Replays and
 * provider reconciliations can arrive with or without an attempt id; they must
 * never downgrade an existing VERIFIED link to unknown (or vice-versa). The
 * select-then-insert also avoids ON CONFLICT inference against the partial
 * unique index uq_recovery_outcome_payment.
 */
export async function recordPaymentOutcome(input: {
  tenantId: string
  invoiceId: string | null
  paymentId: string
  amount?: number | null
  recoveryAttemptId?: string | null
  customerId?: string | null
  occurredAt: string
  source?: string | null
}): Promise<{ attemptId: string | null; attributionStatus: 'verified' | 'unknown' }> {
  const attemptId =
    typeof input.recoveryAttemptId === 'string' && input.recoveryAttemptId
      ? input.recoveryAttemptId
      : null
  const attribution = attributabilityOf(attemptId)

  const { data: existing } = await supabaseAdmin
    .from('recovery_outcomes')
    .select('id')
    .eq('tenant_id', input.tenantId)
    .eq('payment_id', input.paymentId)
    .eq('outcome_type', 'payment')
    .limit(1)
    .maybeSingle()
  if (existing) return { attemptId, attributionStatus: attribution.attribution_status }

  // authority:exempt append_only_observability — immutable recovery evidence ledger
  await supabaseAdmin.from('recovery_outcomes').insert({
    tenant_id: input.tenantId,
    recovery_attempt_id: attemptId,
    outcome_type: 'payment',
    outcome_at: input.occurredAt,
    payment_id: input.paymentId,
    payment_amount: input.amount ?? null,
    invoice_id: input.invoiceId,
    customer_id: input.customerId || null,
    attribution_status: attribution.attribution_status,
    attribution_method: attribution.attribution_method,
    confidence_score: attribution.confidence_score,
    metadata: { source: input.source || null },
  })

  return { attemptId, attributionStatus: attribution.attribution_status }
}