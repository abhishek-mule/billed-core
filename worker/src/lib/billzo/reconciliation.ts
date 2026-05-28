import { supabaseAdmin } from './supabase-admin'
import { matchPaymentToInvoice, MATCHING_ALGORITHM_VERSION, type MatchResult, type PaymentSignal } from './matching'
import { executeIdempotent, IdempotencyPatterns } from './idempotency'
import { emitPaymentReconciled, emitPaymentCompleted } from './events'
import { createQueueLogger } from '../../../lib/queue-logger'

const logger = createQueueLogger('reconciliation-engine')

export interface PaymentReconciliationResult {
  matched: boolean
  invoiceId: string | null
  matchType: 'payment_link' | 'exact' | 'fuzzy' | null
  confidence: number
  invoice: Record<string, unknown> | null
}

export async function reconcilePayment(
  signal: PaymentSignal,
  tenantId: string,
): Promise<PaymentReconciliationResult> {
  if (signal.paymentLinkId) {
    const match = await matchByPaymentLink(signal.paymentLinkId, tenantId)
    if (match) {
      return await finalizeReconciliation(signal, match, 'payment_link', tenantId)
    }
  }

  const fuzzyMatch = await matchPaymentToInvoice(signal, tenantId)
  if (fuzzyMatch) {
    return await finalizeReconciliation(signal, fuzzyMatch, fuzzyMatch.matchType, tenantId)
  }

  logger.warn({ amount: signal.amount, phone: signal.phone, providerPaymentId: signal.providerPaymentId }, 'No matching invoice found for payment')

  return {
    matched: false,
    invoiceId: null,
    matchType: null,
    confidence: 0,
    invoice: null,
  }
}

async function matchByPaymentLink(
  paymentLinkId: string,
  tenantId: string,
): Promise<{ invoiceId: string; invoice: any } | null> {
  const { data: invoice } = await supabaseAdmin
    .from('invoices')
    .select('*')
    .eq('payment_link_id', paymentLinkId)
    .eq('tenant_id', tenantId)
    .in('status', ['unpaid', 'partial', 'overdue'])
    .single()

  if (invoice) {
    return { invoiceId: invoice.id, invoice }
  }

  const { data: invoiceByNote } = await supabaseAdmin
    .from('invoices')
    .select('*')
    .eq('id', paymentLinkId)
    .eq('tenant_id', tenantId)
    .in('status', ['unpaid', 'partial', 'overdue'])
    .single()

  if (invoiceByNote) {
    return { invoiceId: invoiceByNote.id, invoice: invoiceByNote }
  }

  return null
}

async function finalizeReconciliation(
  signal: PaymentSignal,
  match: { invoiceId: string; invoice: any },
  matchType: 'payment_link' | 'exact' | 'fuzzy',
  tenantId: string,
): Promise<PaymentReconciliationResult> {
  const { invoiceId, invoice } = match
  const invoiceTotal = invoice.total || signal.amount

  const now = new Date().toISOString()
  const { error: updateError } = await supabaseAdmin
    .from('invoices')
    .update({
      status: 'paid',
      paid_amount: invoiceTotal,
      updated_at: now,
      sync_status: 'pending',
    })
    .eq('id', invoiceId)

  if (updateError) {
    logger.error({ invoiceId, tenantId, err: updateError }, 'Reconciliation update failed')
    throw updateError
  }

  await emitPaymentReconciled({
    invoiceId,
    tenantId,
    amount: signal.amount,
    provider: signal.provider,
    providerPaymentId: signal.providerPaymentId,
    matchedBy: matchType,
  })

  await emitPaymentCompleted({
    invoiceId,
    tenantId,
    amount: signal.amount,
    provider: signal.provider,
    providerPaymentId: signal.providerPaymentId,
    matchedBy: matchType,
  })

  const confidence = matchType === 'payment_link' ? 1.0 : matchType === 'exact' ? 0.95 : 0.7

  // Write immutable attribution log for replay determinism
  try {
    const reasons = (match as any).reasons || []
    await supabaseAdmin.from('payment_attribution_log').insert({
      tenant_id: tenantId,
      invoice_id: invoiceId,
      provider: signal.provider,
      provider_payment_id: signal.providerPaymentId,
      match_type: matchType,
      match_confidence: confidence,
      matching_algorithm_version: MATCHING_ALGORITHM_VERSION,
      signal_amount: signal.amount,
      signal_currency: signal.currency,
      signal_phone: signal.phone,
      signal_upi_reference: signal.upiReference,
      signal_customer_name: signal.customerName,
      signal_payment_link_id: signal.paymentLinkId,
      signal_timestamp: signal.timestamp,
      invoice_total: invoiceTotal,
      invoice_status: invoice.status,
      invoice_customer_name: invoice.customer_name,
      invoice_customer_phone: invoice.customer_phone,
      invoice_created_at: invoice.created_at,
      match_reasons: reasons,
      raw_signal: signal.rawPayload,
    })
  } catch (err: any) {
    logger.error({ invoiceId, err: err.message }, 'Failed to write payment attribution log')
  }

  logger.info({ invoiceId, matchType, amount: signal.amount }, 'Payment matched and invoice updated')

  return {
    matched: true,
    invoiceId,
    matchType,
    confidence,
    invoice,
  }
}
