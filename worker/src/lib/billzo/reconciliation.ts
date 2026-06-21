import { supabaseAdmin } from './supabase-admin'
import { matchPaymentToInvoice, MATCHING_ALGORITHM_VERSION, type MatchResult, type PaymentSignal } from './matching'
import { executeIdempotent, IdempotencyPatterns } from './idempotency'
import { emitPaymentReconciled, emitPaymentCompleted } from './events'
import { createQueueLogger } from '../../../lib/queue-logger'
import type { InternalAuthorityClient } from '../../lib/authority/internal-authority'

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
  authority?: InternalAuthorityClient,
): Promise<PaymentReconciliationResult> {
  if (signal.paymentLinkId) {
    const match = await matchByPaymentLink(signal.paymentLinkId, tenantId)
    if (match) {
      return await finalizeReconciliation(signal, match, 'payment_link', tenantId, authority)
    }
  }

  const fuzzyMatch = await matchPaymentToInvoice(signal, tenantId)
  if (fuzzyMatch) {
    return await finalizeReconciliation(signal, fuzzyMatch, fuzzyMatch.matchType, tenantId, authority)
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
  authority?: InternalAuthorityClient,
): Promise<PaymentReconciliationResult> {
  const { invoiceId, invoice } = match
  const invoiceTotal = invoice.total || signal.amount

  if (authority) {
    const markPaidResult = await authority.submit({
      intentType: 'invoice.mark_paid',
      tenantId,
      actor: 'reconciliation-worker',
      payload: { invoiceId, status: 'paid', paidAmount: invoiceTotal },
    }, 'trusted_sync')

    if (!markPaidResult.accepted) {
      logger.error({ invoiceId, tenantId, err: markPaidResult.error }, 'Authority rejected mark_paid')
      throw new Error(markPaidResult.error ?? 'Authority rejected mark_paid')
    }
  } else {
    // authority:fallback invoice.mark_paid
    const now = new Date().toISOString()
    const { error: updateError } = await supabaseAdmin
      .from('invoices')
      .update({ status: 'paid', paid_amount: invoiceTotal, updated_at: now, sync_status: 'pending' })
      .eq('id', invoiceId)

    if (updateError) {
      logger.error({ invoiceId, tenantId, err: updateError }, 'Reconciliation update failed')
      throw updateError
    }
  }

  // Record payment in unified ledger — trigger auto-maintains outstanding_amount
  try {
    const { recordPayment } = await import('../recovery/payment-handler')
    const rawPayload = signal.rawPayload as any
    const result = await recordPayment({
      tenantId,
      invoiceId,
      customerId: invoice.customer_id,
      amount: signal.amount,
      source: signal.provider === 'razorpay' ? 'razorpay' : 'cash',
      actor: 'customer',
      evidence: {
        razorpayPaymentId: signal.providerPaymentId,
        razorpayOrderId: rawPayload?.payment?.entity?.order_id,
        utr: signal.upiReference || undefined,
        notes: `Auto-reconciled via ${signal.provider} (${matchType})`,
      },
    })
    if ('error' in result) {
      logger.error({ invoiceId, err: result.error }, 'Failed to record payment in ledger')
    }
  } catch (err: any) {
    logger.error({ invoiceId, err: err.message }, 'Failed to record payment in ledger')
  }

  await emitPaymentReconciled({
    invoiceId,
    tenantId,
    customerId: invoice.customer_id,
    amount: signal.amount,
    provider: signal.provider,
    providerPaymentId: signal.providerPaymentId,
    matchedBy: matchType,
  })

  await emitPaymentCompleted({
    invoiceId,
    tenantId,
    customerId: invoice.customer_id,
    amount: signal.amount,
    provider: signal.provider,
    providerPaymentId: signal.providerPaymentId,
    matchedBy: matchType,
  })

  const confidence = matchType === 'payment_link' ? 1.0 : matchType === 'exact' ? 0.95 : 0.7

  // Write immutable attribution log for replay determinism
  try {
    if (authority) {
      const attrResult = await authority.submit({
        intentType: 'reconciliation.log_attribution',
        tenantId,
        actor: 'reconciliation-worker',
        payload: {
          invoiceId,
          provider: signal.provider,
          providerPaymentId: signal.providerPaymentId,
          matchType,
          matchConfidence: confidence,
          matchingAlgorithmVersion: MATCHING_ALGORITHM_VERSION,
          signalAmount: signal.amount,
          signalCurrency: signal.currency,
          signalPhone: signal.phone,
          signalUpiReference: signal.upiReference,
          signalCustomerName: signal.customerName,
          signalPaymentLinkId: signal.paymentLinkId,
          signalTimestamp: signal.timestamp,
          invoiceTotal,
          invoiceStatus: invoice.status,
          invoiceCustomerName: invoice.customer_name,
          invoiceCustomerPhone: invoice.customer_phone,
          invoiceCreatedAt: invoice.created_at,
          matchReasons: (match as any).reasons || [],
          rawSignal: signal.rawPayload,
        },
      }, 'trusted_sync')

      if (!attrResult.accepted) {
        logger.error({ invoiceId, err: attrResult.error }, 'Authority rejected attribution log')
      }
    } else {
      // authority:fallback reconciliation.log_attribution
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
    }
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
