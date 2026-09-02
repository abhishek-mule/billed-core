import { supabaseAdmin } from '../billzo/supabase-admin'

/**
 * Phase 1.5 B2 — promise outcome ledger.
 *
 * promise_kept / promise_broken are recorded against payment_promises.triggered_by_action_id
 * (the recovery attempt that prompted the promise) when that identity is known.
 * Missing identity => the attempt stays NULL and attribution_status is 'unknown' —
 * causality is never guessed from timestamps.
 */

export async function recordPromiseKeepIfHonored(input: {
  tenantId: string
  invoiceId: string
  customerId: string | null
  paymentAmount: number | null
  occurredAt: string
}): Promise<void> {
  const { data: activePromise } = await supabaseAdmin
    .from('payment_promises')
    .select('id, invoice_id, promise_date, triggered_by_action_id')
    .eq('tenant_id', input.tenantId)
    .eq('invoice_id', input.invoiceId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()

  if (!activePromise) return

  // A promise is only "kept" when the payment lands on or before its date.
  const honoredOnTime = !activePromise.promise_date || input.occurredAt <= activePromise.promise_date
  if (!honoredOnTime) return

  const attemptId = activePromise.triggered_by_action_id || null
  const { data: existing } = await supabaseAdmin
    .from('recovery_outcomes')
    .select('id')
    .eq('promise_id', activePromise.id)
    .eq('outcome_type', 'promise_kept')
    .limit(1)
    .maybeSingle()
  if (existing) return

  // authority:exempt append_only_observability — immutable promise outcome ledger
  await supabaseAdmin.from('recovery_outcomes').insert({
    tenant_id: input.tenantId,
    recovery_attempt_id: attemptId,
    outcome_type: 'promise_kept',
    outcome_at: input.occurredAt,
    promise_id: activePromise.id,
    payment_amount: input.paymentAmount,
    invoice_id: activePromise.invoice_id || input.invoiceId,
    customer_id: input.customerId,
    attribution_status: attemptId ? 'verified' : 'unknown',
    attribution_method: attemptId ? 'explicit' : null,
    confidence_score: attemptId ? 1 : null,
    metadata: { trigger: 'payment.completed' },
  })
}

export async function recordBrokenPromisesLedger(input: {
  tenantId: string
  customerId: string
  occurredAt: string
}): Promise<void> {
  const { data: activePromises } = await supabaseAdmin
    .from('payment_promises')
    .select('id, invoice_id, triggered_by_action_id')
    .eq('tenant_id', input.tenantId)
    .eq('customer_id', input.customerId)
    .eq('status', 'active')

  if (!activePromises || activePromises.length === 0) return

  for (const promise of activePromises) {
    const attemptId = promise.triggered_by_action_id || null
    const { data: existing } = await supabaseAdmin
      .from('recovery_outcomes')
      .select('id')
      .eq('promise_id', promise.id)
      .eq('outcome_type', 'promise_broken')
      .limit(1)
      .maybeSingle()
    if (existing) continue

    // authority:exempt append_only_observability — immutable promise outcome ledger
    await supabaseAdmin.from('recovery_outcomes').insert({
      tenant_id: input.tenantId,
      recovery_attempt_id: attemptId,
      outcome_type: 'promise_broken',
      outcome_at: input.occurredAt,
      promise_id: promise.id,
      invoice_id: promise.invoice_id || null,
      customer_id: input.customerId,
      attribution_status: attemptId ? 'verified' : 'unknown',
      attribution_method: attemptId ? 'explicit' : null,
      confidence_score: attemptId ? 1 : null,
      metadata: { trigger: 'promise.broken' },
    })
  }
}