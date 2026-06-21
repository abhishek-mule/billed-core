import { supabaseAdmin } from '../billzo/supabase-admin'
import { emitEvent } from '../billzo/events'
import { EventType } from '@billzo/shared'
import type { PaymentSource, PaymentEvidence, PaymentActor } from '@billzo/shared'
import { rerunDecisionEngine } from './rerun-engine'
import crypto from 'crypto'

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

export async function recordPayment(input: RecordPaymentInput): Promise<{ paymentId: string; invoiceId: string } | { error: string }> {
  const paymentId = crypto.randomUUID()
  const now = new Date().toISOString()

  // authority:governed payment.record — trigger maintains outstanding_amount
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

  // Emit payment.completed event
  await emitEvent({
    type: EventType.PAYMENT_COMPLETED,
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
    causationId: null,
    correlationId: `payment:${input.invoiceId}`,
    producer: 'worker',
    idempotencyKey: `payment:recorded:${paymentId}`,
    retentionDays: 365,
  })

  // Re-run decision engine with fresh outstanding — trigger has already updated the invoice
  await rerunDecisionEngine(input.invoiceId, input.tenantId).catch((err: any) => {
    console.error('[PaymentHandler] Failed to re-run decision engine:', err.message)
  })

  return { paymentId, invoiceId: input.invoiceId }
}
