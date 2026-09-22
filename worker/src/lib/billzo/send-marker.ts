import { supabaseAdmin } from './supabase-admin'

/**
 * Pre-execution send guard (B-05b): at-most-once provider sends.
 *
 * This marker — like the 24h duplicate check, the paid-check, and the outbox
 * claim — is a defense-in-depth execution invariant, distinct from Layer A
 * business rules (decision-engine). Guards enforce safe execution against
 * stale/concurrent evidence; rules decide desirability. See ADR-005.
 *
 * The UNIQUE on processed_jobs(idempotency_key) — guaranteed by migration
 * 102 — is the atomic arbiter: the first claimant's INSERT wins, every later
 * claimant gets 23505 and must skip the send. Callers:
 *  - send-message-handler.ts (outbox transport lane), keyed by outbox event id
 *  - queues/reminders.ts (BullMQ reminders worker), keyed by BullMQ job id
 *
 * Semantics: a crash between marker-claim and provider send loses ONE message
 * (later cycles re-plan); a duplicate send to a customer is the worse outcome.
 * Unexpected store errors THROW so the caller retries later instead of sending
 * unguarded now.
 */
export type SendMarkerResult = 'claimed' | 'duplicate'

export async function claimSendMarker(args: {
  key: string
  tenantId: string
}): Promise<SendMarkerResult> {
  const { error } = await supabaseAdmin.from('processed_jobs').insert({
    idempotency_key: args.key,
    job_type: 'whatsapp_send',
    tenant_id: args.tenantId,
    status: 'claimed',
    created_at: new Date().toISOString(),
  })

  if (error) {
    if ((error as any)?.code === '23505') return 'duplicate'
    throw new Error(`Send-marker write failed: ${error.message}`)
  }

  return 'claimed'
}

/**
 * Best-effort compensation: release a claimed marker so a later retry may
 * send. Used only when the provider send itself failed (nothing reached the
 * customer, so re-arming is safe). Never throws.
 */
export async function releaseSendMarker(key: string): Promise<void> {
  await supabaseAdmin
    .from('processed_jobs')
    .delete()
    .eq('idempotency_key', key)
    .then(
      () => {},
      () => {},
    )
}
