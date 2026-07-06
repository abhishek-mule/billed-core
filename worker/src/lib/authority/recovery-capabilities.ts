import { supabaseAdmin } from '../billzo/supabase-admin'
import type { CapabilityProvider } from './schemas'

export const recoveryRecordAttribution: CapabilityProvider = {
  capabilityId: 'recovery.record_attribution.v1',
  classification: 'infrastructure',
  reversibility: 'irreversible',
  blastRadius: 'tenant',
  priorityClass: 'analytics',
  estimatedCost: 'low',
  estimatedLatencyMs: 100,
  externalDependencyCount: 0,
  requiresApproval: false,
  compensatable: false,
  minIntentVersion: 1,
  maxIntentVersion: 1,
  ownedMutations: [
    { table: 'recovery_attributions', columns: undefined },
  ],
  execute: async (intent) => {
    const payload = intent.payload as any
    const t0 = performance.now()
    const { error } = await supabaseAdmin.from('recovery_attributions').insert({
      tenant_id: payload.tenantId,
      invoice_id: payload.invoiceId,
      payment_id: payload.paymentId ?? null,
      reminder_event_id: payload.reminderEventId,
      amount: payload.amount ?? 0,
      attribution_type: payload.attributionType ?? 'last_touch',
      attribution_window_hours: payload.attributionWindowHours ?? 48,
      confidence_score: payload.confidenceScore ?? 1.0,
    })
    if (error) {
      return { success: false, error: error.message, executionLatencyMs: performance.now() - t0 }
    }
    return { success: true, data: { invoiceId: payload.invoiceId }, executionLatencyMs: performance.now() - t0 }
  },
  semanticNormalizer: (p) => ({ invoiceId: p.invoiceId, reminderEventId: p.reminderEventId }),
}

export const recoveryUpsertCase: CapabilityProvider = {
  capabilityId: 'recovery.upsert_case.v1',
  classification: 'financial',
  reversibility: 'reversible',
  blastRadius: 'tenant',
  priorityClass: 'critical_financial',
  estimatedCost: 'low',
  estimatedLatencyMs: 100,
  externalDependencyCount: 0,
  requiresApproval: false,
  compensatable: false,
  minIntentVersion: 1,
  maxIntentVersion: 1,
  ownedMutations: [
    { table: 'recovery_cases', columns: undefined },
  ],
  execute: async (intent) => {
    const { customerId, invoiceId, totalOutstanding } = intent.payload as any
    const t0 = performance.now()
    const now = new Date().toISOString()
    const { data: existing } = await supabaseAdmin
      .from('recovery_cases')
      .select('id')
      .eq('tenant_id', intent.tenantId)
      .eq('customer_id', customerId)
      .eq('status', 'open')
      .limit(1)
      .single()
    if (existing) {
      const { error } = await supabaseAdmin
        .from('recovery_cases')
        .update({ last_activity_at: now, updated_at: now })
        .eq('id', existing.id)
      if (error) {
        return { success: false, error: error.message, executionLatencyMs: performance.now() - t0 }
      }
    } else {
      const { error } = await supabaseAdmin
        .from('recovery_cases')
        .insert({
          tenant_id: intent.tenantId,
          customer_id: customerId,
          status: 'open',
          total_outstanding: totalOutstanding ?? 0,
          total_overdue: totalOutstanding ?? 0,
          invoice_count: 1,
          last_activity_at: now,
        })
      if (error) {
        return { success: false, error: error.message, executionLatencyMs: performance.now() - t0 }
      }
    }
    return { success: true, data: { tenantId: intent.tenantId, customerId }, executionLatencyMs: performance.now() - t0 }
  },
  semanticNormalizer: (p) => ({ customerId: p.customerId, invoiceId: p.invoiceId }),
}

export const recoveryCapabilities: CapabilityProvider[] = [
  recoveryRecordAttribution,
  recoveryUpsertCase,
]
