import { supabaseAdmin } from '../../billzo/supabase-admin'
import type { Handler } from '../types'

export const reconciliationLogAttribution: Handler = {
  domain: 'annotation_state',
  execute: async (payload, tenantId) => {
    const {
      invoiceId, provider, providerPaymentId, matchType, matchConfidence,
      matchingAlgorithmVersion, signalAmount, signalCurrency, signalPhone,
      signalUpiReference, signalCustomerName, signalPaymentLinkId,
      signalTimestamp, invoiceTotal, invoiceStatus, invoiceCustomerName,
      invoiceCustomerPhone, invoiceCreatedAt, matchReasons, rawSignal,
    } = payload as any
    if (!invoiceId) {
      return { outcome: 'failure', error: 'invoiceId is required', touchedRows: [], transitionTraces: [] }
    }
    // authority:governed reconciliation.log_attribution
    const { error } = await supabaseAdmin.from('payment_attribution_log').insert({
      tenant_id: tenantId,
      invoice_id: invoiceId,
      provider,
      provider_payment_id: providerPaymentId,
      match_type: matchType,
      match_confidence: matchConfidence,
      matching_algorithm_version: matchingAlgorithmVersion ?? 1,
      signal_amount: signalAmount,
      signal_currency: signalCurrency ?? 'INR',
      signal_phone: signalPhone ?? null,
      signal_upi_reference: signalUpiReference ?? null,
      signal_customer_name: signalCustomerName ?? null,
      signal_payment_link_id: signalPaymentLinkId ?? null,
      signal_timestamp: signalTimestamp ?? null,
      invoice_total: invoiceTotal ?? null,
      invoice_status: invoiceStatus ?? null,
      invoice_customer_name: invoiceCustomerName ?? null,
      invoice_customer_phone: invoiceCustomerPhone ?? null,
      invoice_created_at: invoiceCreatedAt ?? null,
      match_reasons: matchReasons ?? [],
      raw_signal: rawSignal ?? null,
    })
    if (error) {
      return { outcome: 'failure', error: error.message, touchedRows: [], transitionTraces: [] }
    }
    return {
      outcome: 'success',
      touchedRows: [{ table: 'payment_attribution_log', id: invoiceId, changedFields: ['provider', 'match_type', 'signal_amount'] }],
      transitionTraces: [{ entity: 'payment_attribution', entityId: invoiceId, field: 'match_type', from: null, to: matchType, sequence: 0 }],
    }
  },
}
