// ============================================================
// override-handler.ts — Merchant Override (Rule #9)
// ============================================================
// Called when a merchant explicitly approves sending a reminder
// that the decision engine blocked.
//
// If the override targets a high-value customer (VIP, high
// reputation score, large outstanding), the handler requires
// explicit acknowledgement of a warning before applying.
// ============================================================

import { supabaseAdmin } from '../billzo/supabase-admin'
import { emitEvent } from '../billzo/events'
import { EventType } from '@billzo/shared'

export interface OverrideRequest {
  invoiceId: string
  tenantId: string
  reason: string
  warningAcked?: boolean
}

export interface OverrideResponse {
  applied: boolean
  warning?: string
  requiresAck?: boolean
}

const HIGH_VALUE_THRESHOLDS = {
  minOutstanding: 100000,
  minReputationScore: 80,
}

// ============================================================
// applyOverride — Set override on invoice
// ============================================================
// Returns { applied, warning?, requiresAck? }
//
// If the customer is high-value and warningAcked is false,
// returns { applied: false, warning: "...", requiresAck: true }.
// The caller should present the warning to the merchant and
// retry with warningAcked: true.
// ============================================================

export async function applyOverride(req: OverrideRequest): Promise<OverrideResponse> {
  // Fetch invoice + customer to assess risk
  const { data: invoice } = await supabaseAdmin
    .from('invoices')
    .select('customer_id, total, outstanding_amount, tenant_id')
    .eq('id', req.invoiceId)
    .single()

  if (!invoice) {
    return { applied: false }
  }

  const { data: customer } = await supabaseAdmin
    .from('customers')
    .select('customer_tier, reputation_score, customer_name')
    .eq('id', invoice.customer_id)
    .single()

  // Assess if this override is high-risk
  const outstanding = invoice.outstanding_amount ?? invoice.total ?? 0
  const isVip = customer?.customer_tier === 'vip'
  const highReputation = (customer?.reputation_score ?? 50) >= HIGH_VALUE_THRESHOLDS.minReputationScore
  const highValue = outstanding >= HIGH_VALUE_THRESHOLDS.minOutstanding
  const isHighRisk = isVip || highReputation || highValue

  if (isHighRisk && !req.warningAcked) {
    const customerName = customer?.customer_name || 'This customer'
    const details: string[] = []
    if (isVip) details.push('VIP customer')
    if (highReputation) details.push(`${customer?.reputation_score}/100 reputation score`)
    if (highValue) details.push(`₹${outstanding.toLocaleString('en-IN')} outstanding`)

    return {
      applied: false,
      warning: `${customerName} has generated significant business. ${details.join(', ')}. Overriding the block may damage this relationship. Are you sure?`,
      requiresAck: true,
    }
  }

  // Apply the override
  const { error } = await supabaseAdmin
    .from('invoices')
    .update({
      override_send: true,
      override_at: new Date().toISOString(),
      override_reason: req.reason,
      override_warning_acked: req.warningAcked || false,
    })
    .eq('id', req.invoiceId)

  if (error) {
    return { applied: false }
  }

  // Emit event
  await emitEvent({
    type: EventType.RECOVERY_OVERRIDE_APPROVED,
    tenantId: req.tenantId,
    entityId: req.invoiceId,
    payload: {
      reason: req.reason,
      warningAcked: req.warningAcked || false,
      isHighRisk,
    },
    causationId: null,
    correlationId: `override:${req.invoiceId}`,
    producer: 'worker',
    idempotencyKey: `override:${req.invoiceId}:${Date.now()}`,
    retentionDays: 90,
  })

  return { applied: true }
}

// ============================================================
// clearOverride — Remove override after successful send
// ============================================================

export async function clearOverride(invoiceId: string): Promise<void> {
  await supabaseAdmin
    .from('invoices')
    .update({
      override_send: false,
      override_at: null,
      override_reason: null,
      override_warning_acked: false,
    })
    .eq('id', invoiceId)
}
