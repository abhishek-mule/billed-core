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
    actor: input.actor,
    evidence: input.evidence || {},
    notes: input.notes || null,
    status: 'paid',
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
      actor: input.actor,
      evidence: input.evidence || {},
      paymentId,
    },
    correlationId: `payment:${input.invoiceId}`,
  })

  return { paymentId }
}
