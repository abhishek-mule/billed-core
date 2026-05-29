import { supabaseAdmin } from '../../billzo/supabase-admin'
import type { Handler } from '../types'

function now(): string {
  return new Date().toISOString()
}

export const invoiceMarkPaid: Handler = {
  domain: 'financial_state',
  execute: async (payload, tenantId) => {
    const { invoiceId, status, paidAmount } = payload as any
    if (!invoiceId) {
      return { outcome: 'failure', error: 'invoiceId is required', touchedRows: [], transitionTraces: [] }
    }
    const { error } = await supabaseAdmin
      .from('invoices')
      .update({ status: status ?? 'paid', paid_amount: paidAmount ?? 0, updated_at: now(), sync_status: 'pending' })
      .eq('id', invoiceId)
    if (error) {
      return { outcome: 'failure', error: error.message, touchedRows: [], transitionTraces: [] }
    }
    return {
      outcome: 'success',
      touchedRows: [{ table: 'invoices', id: invoiceId, changedFields: ['status', 'paid_amount', 'updated_at', 'sync_status'] }],
      transitionTraces: [
        { entity: 'invoice', entityId: invoiceId, field: 'status', from: null, to: status ?? 'paid', sequence: 0 },
        { entity: 'invoice', entityId: invoiceId, field: 'paid_amount', from: null, to: String(paidAmount ?? 0), sequence: 1 },
      ],
    }
  },
}

export const reminderAdvanceStage: Handler = {
  domain: 'recovery_state',
  execute: async (payload) => {
    const { invoiceId, lastWhatsappStatus, lastWhatsappAt, recoveryStage, nextRecoveryAt } = payload as any
    if (!invoiceId) {
      return { outcome: 'failure', error: 'invoiceId is required', touchedRows: [], transitionTraces: [] }
    }
    const updates: Record<string, any> = { sync_status: 'pending' }
    if (lastWhatsappStatus !== undefined) updates.last_whatsapp_status = lastWhatsappStatus
    if (lastWhatsappAt !== undefined) updates.last_whatsapp_at = lastWhatsappAt
    if (recoveryStage !== undefined) updates.recovery_stage = recoveryStage
    if (nextRecoveryAt !== undefined) updates.next_recovery_at = nextRecoveryAt
    const { error } = await supabaseAdmin.from('invoices').update(updates).eq('id', invoiceId)
    if (error) {
      return { outcome: 'failure', error: error.message, touchedRows: [], transitionTraces: [] }
    }
    const changed = Object.keys(updates)
    return {
      outcome: 'success',
      touchedRows: [{ table: 'invoices', id: invoiceId, changedFields: changed }],
      transitionTraces: changed.map((f, i) => ({
        entity: 'invoice', entityId: invoiceId, field: f, from: null, to: String(updates[f]), sequence: i,
      })),
    }
  },
}

export const reminderUpdateCadence: Handler = {
  domain: 'recovery_state',
  execute: async (payload) => {
    const { invoiceId, nextRecoveryAt } = payload as any
    if (!invoiceId) {
      return { outcome: 'failure', error: 'invoiceId is required', touchedRows: [], transitionTraces: [] }
    }
    const { error } = await supabaseAdmin
      .from('invoices')
      .update({ next_recovery_at: nextRecoveryAt })
      .eq('id', invoiceId)
    if (error) {
      return { outcome: 'failure', error: error.message, touchedRows: [], transitionTraces: [] }
    }
    return {
      outcome: 'success',
      touchedRows: [{ table: 'invoices', id: invoiceId, changedFields: ['next_recovery_at'] }],
      transitionTraces: [{ entity: 'invoice', entityId: invoiceId, field: 'next_recovery_at', from: null, to: String(nextRecoveryAt), sequence: 0 }],
    }
  },
}

export const invoiceUpdateRecoveryState: Handler = {
  domain: 'recovery_state',
  execute: async (payload) => {
    const { invoiceId, recoveryFlag, lastWhatsappStatus, lastWhatsappAt } = payload as any
    if (!invoiceId) {
      return { outcome: 'failure', error: 'invoiceId is required', touchedRows: [], transitionTraces: [] }
    }
    const updates: Record<string, any> = {}
    if (recoveryFlag !== undefined) updates.recovery_flag = recoveryFlag
    if (lastWhatsappStatus !== undefined) updates.last_whatsapp_status = lastWhatsappStatus
    if (lastWhatsappAt !== undefined) updates.last_whatsapp_at = lastWhatsappAt
    const { error } = await supabaseAdmin.from('invoices').update(updates).eq('id', invoiceId)
    if (error) {
      return { outcome: 'failure', error: error.message, touchedRows: [], transitionTraces: [] }
    }
    const changed = Object.keys(updates)
    return {
      outcome: 'success',
      touchedRows: [{ table: 'invoices', id: invoiceId, changedFields: changed }],
      transitionTraces: changed.map((f, i) => ({
        entity: 'invoice', entityId: invoiceId, field: f, from: null, to: String(updates[f]), sequence: i,
      })),
    }
  },
}
