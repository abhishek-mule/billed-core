import { supabaseAdmin } from '../../billzo/supabase-admin'
import type { Handler } from '../types'

export const recoveryRecordAttribution: Handler = {
  domain: 'annotation_state',
  execute: async (payload) => {
    const { invoiceId, paymentId, reminderEventId, attributionType, attributionWindowHours, confidenceScore } = payload as any
    if (!invoiceId || !reminderEventId) {
      return { outcome: 'failure', error: 'invoiceId and reminderEventId are required', touchedRows: [], transitionTraces: [] }
    }
    // authority:governed recovery.record_attribution
    const { error } = await supabaseAdmin.from('recovery_attributions').insert({
      invoice_id: invoiceId,
      payment_id: paymentId ?? null,
      reminder_event_id: reminderEventId,
      attribution_type: attributionType ?? 'last_touch',
      attribution_window_hours: attributionWindowHours ?? 48,
      confidence_score: confidenceScore ?? 1.0,
    })
    if (error) {
      return { outcome: 'failure', error: error.message, touchedRows: [], transitionTraces: [] }
    }
    return {
      outcome: 'success',
      touchedRows: [{ table: 'recovery_attributions', id: invoiceId, changedFields: ['invoice_id', 'reminder_event_id', 'attribution_type'] }],
      transitionTraces: [{ entity: 'recovery_attribution', entityId: invoiceId, field: 'attribution_type', from: null, to: attributionType ?? 'last_touch', sequence: 0 }],
    }
  },
}

export const recoveryUpsertCase: Handler = {
  domain: 'recovery_state',
  execute: async (payload, tenantId) => {
    const { customerId, invoiceId, totalOutstanding } = payload as any
    if (!customerId) {
      return { outcome: 'failure', error: 'customerId is required', touchedRows: [], transitionTraces: [] }
    }
    const now = new Date().toISOString()
    const { data: existing } = await supabaseAdmin
      .from('recovery_cases')
      .select('id')
      .eq('tenant_id', tenantId)
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
        return { outcome: 'failure', error: error.message, touchedRows: [], transitionTraces: [] }
      }
      return {
        outcome: 'success',
        touchedRows: [{ table: 'recovery_cases', id: existing.id, changedFields: ['last_activity_at', 'updated_at'] }],
        transitionTraces: [{ entity: 'recovery_case', entityId: existing.id, field: 'last_activity_at', from: null, to: now, sequence: 0 }],
      }
    } else {
      const { error } = await supabaseAdmin
        .from('recovery_cases')
        .insert({
          tenant_id: tenantId,
          customer_id: customerId,
          status: 'open',
          total_outstanding: totalOutstanding ?? 0,
          invoice_count: 1,
          last_activity_at: now,
        })
      if (error) {
        return { outcome: 'failure', error: error.message, touchedRows: [], transitionTraces: [] }
      }
      return {
        outcome: 'success',
        touchedRows: [{ table: 'recovery_cases', id: 'new', changedFields: ['tenant_id', 'customer_id', 'status', 'total_outstanding', 'invoice_count', 'last_activity_at'] }],
        transitionTraces: [{ entity: 'recovery_case', entityId: 'new', field: 'status', from: null, to: 'open', sequence: 0 }],
      }
    }
  },
}
