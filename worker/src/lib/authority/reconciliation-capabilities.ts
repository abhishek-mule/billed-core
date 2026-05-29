import { supabaseAdmin } from '../billzo/supabase-admin'
import type { CapabilityProvider } from './schemas'

export const reconciliationLogAttribution: CapabilityProvider = {
  capabilityId: 'reconciliation.log_attribution.v1',
  classification: 'financial',
  reversibility: 'irreversible',
  blastRadius: 'tenant',
  priorityClass: 'critical_financial',
  estimatedCost: 'low',
  estimatedLatencyMs: 150,
  externalDependencyCount: 0,
  requiresApproval: false,
  compensatable: false,
  minIntentVersion: 1,
  maxIntentVersion: 1,
  ownedMutations: [
    { table: 'payment_attribution_log', columns: undefined },
  ],
  execute: async (intent) => {
    const payload = intent.payload as any
    const t0 = performance.now()
    const { error } = await supabaseAdmin.from('payment_attribution_log').insert({
      tenant_id: intent.tenantId,
      invoice_id: payload.invoiceId,
      provider: payload.provider,
      provider_payment_id: payload.providerPaymentId,
      match_type: payload.matchType,
      match_confidence: payload.matchConfidence,
      matching_algorithm_version: payload.matchingAlgorithmVersion ?? 1,
      signal_amount: payload.signalAmount,
      signal_currency: payload.signalCurrency ?? 'INR',
      signal_phone: payload.signalPhone ?? null,
      signal_upi_reference: payload.signalUpiReference ?? null,
      signal_customer_name: payload.signalCustomerName ?? null,
      signal_payment_link_id: payload.signalPaymentLinkId ?? null,
      signal_timestamp: payload.signalTimestamp ?? null,
      invoice_total: payload.invoiceTotal ?? null,
      invoice_status: payload.invoiceStatus ?? null,
      invoice_customer_name: payload.invoiceCustomerName ?? null,
      invoice_customer_phone: payload.invoiceCustomerPhone ?? null,
      invoice_created_at: payload.invoiceCreatedAt ?? null,
      match_reasons: payload.matchReasons ?? [],
      raw_signal: payload.rawSignal ?? null,
    })
    if (error) {
      return { success: false, error: error.message, executionLatencyMs: performance.now() - t0 }
    }
    return { success: true, data: { invoiceId: payload.invoiceId }, executionLatencyMs: performance.now() - t0 }
  },
  semanticNormalizer: (p) => ({ invoiceId: p.invoiceId, providerPaymentId: p.providerPaymentId }),
}

export const reconciliationCapabilities: CapabilityProvider[] = [
  reconciliationLogAttribution,
]
