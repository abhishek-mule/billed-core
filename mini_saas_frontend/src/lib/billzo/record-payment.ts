import crypto from 'crypto'
import { supabaseAdmin } from './supabase-admin'
import { writeOutboxEvent } from './outbox'
import type { PaymentSource, PaymentEvidence, PaymentActor } from '@billzo/shared'

export interface RecordPaymentInput {
  tenantId: string
  invoiceId: string
  customerId: string
  amount: number
  source: PaymentSource
  sourceId?: string
  actor: PaymentActor
  evidence?: PaymentEvidence
  notes?: string
}

export async function recordPayment(input: RecordPaymentInput): Promise<{ paymentId: string } | { error: string }> {
  const paymentId = crypto.randomUUID()
  const now = new Date().toISOString()

  const { error: insertError } = await supabaseAdmin.from('payments').insert({
    id: paymentId,
    tenant_id: input.tenantId,
    invoice_id: input.invoiceId,
    amount: input.amount,
    payment_mode: input.source,
    source: input.source,
    source_id: input.sourceId || null,
    actor: input.actor,
    evidence: input.evidence || {},
    notes: input.notes || null,
    status: 'paid',
    lifecycle_status: 'created',
    paid_at: now,
    created_at: now,
    updated_at: now,
  })

  if (insertError) {
    return { error: insertError.message }
  }

  await writeOutboxEvent({
    type: 'payment.completed',
    tenantId: input.tenantId,
    entityId: input.invoiceId,
    payload: {
      customerId: input.customerId,
      amount: input.amount,
      source: input.source,
      sourceId: input.sourceId,
      actor: input.actor,
      evidence: input.evidence || {},
      paymentId,
    },
    correlationId: `payment:${input.invoiceId}`,
  })

  return { paymentId }
}

// ── syncPayment — for offline-sync path ──
// Upserts an existing payment (already in Dexie) into Supabase and emits
// payment.completed so the worker processes it. Does NOT create a new payment ID.
export async function syncPayment(input: RecordPaymentInput & { paymentId: string }): Promise<{ error?: string }> {
  const now = new Date().toISOString()

  const { error: upsertError } = await supabaseAdmin.from('payments').upsert({
    id: input.paymentId,
    tenant_id: input.tenantId,
    invoice_id: input.invoiceId,
    amount: input.amount,
    payment_mode: input.source,
    source: input.source,
    source_id: input.sourceId || null,
    actor: input.actor,
    evidence: input.evidence || {},
    notes: input.notes || null,
    status: 'paid',
    lifecycle_status: 'synced',
    paid_at: now,
    created_at: now,
    updated_at: now,
  }, { onConflict: 'id' })

  if (upsertError) {
    return { error: upsertError.message }
  }

  await writeOutboxEvent({
    type: 'payment.completed',
    tenantId: input.tenantId,
    entityId: input.invoiceId,
    payload: {
      customerId: input.customerId,
      amount: input.amount,
      source: input.source,
      sourceId: input.sourceId,
      actor: input.actor,
      evidence: input.evidence || {},
      paymentId: input.paymentId,
    },
    correlationId: `payment:${input.invoiceId}:sync:${input.paymentId}`,
  })

  return {}
}
