import { supabaseAdmin } from '../billzo/supabase-admin'
import type { CapabilityProvider } from './schemas'

function now(): string {
  return new Date().toISOString()
}

export const invoiceMarkPaid: CapabilityProvider = {
  capabilityId: 'invoice.mark_paid.v1',
  classification: 'financial',
  reversibility: 'irreversible',
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
    { table: 'invoices', columns: ['status', 'paid_amount', 'updated_at', 'sync_status'] },
  ],
  execute: async (intent) => {
    const { invoiceId, status, paidAmount } = intent.payload as any
    const t0 = performance.now()
    const { error } = await supabaseAdmin
      .from('invoices')
      .update({ status: status ?? 'paid', paid_amount: paidAmount ?? 0, updated_at: now(), sync_status: 'pending' })
      .eq('id', invoiceId)
    if (error) {
      return { success: false, error: error.message, executionLatencyMs: performance.now() - t0 }
    }
    return { success: true, data: { invoiceId }, executionLatencyMs: performance.now() - t0 }
  },
  semanticNormalizer: (p) => ({ invoiceId: p.invoiceId, status: p.status }),
}

export const reminderAdvanceStage: CapabilityProvider = {
  capabilityId: 'reminder.advance_stage.v1',
  classification: 'infrastructure',
  reversibility: 'reversible',
  blastRadius: 'tenant',
  priorityClass: 'transport',
  estimatedCost: 'low',
  estimatedLatencyMs: 100,
  externalDependencyCount: 0,
  requiresApproval: false,
  compensatable: false,
  minIntentVersion: 1,
  maxIntentVersion: 1,
  ownedMutations: [
    {
      table: 'invoices',
      columns: ['last_whatsapp_status', 'last_whatsapp_at', 'recovery_stage', 'next_recovery_at', 'sync_status'],
    },
  ],
  execute: async (intent) => {
    const { invoiceId, lastWhatsappStatus, lastWhatsappAt, recoveryStage, nextRecoveryAt } = intent.payload as any
    const t0 = performance.now()
    const updates: Record<string, any> = { sync_status: 'pending' }
    if (lastWhatsappStatus !== undefined) updates.last_whatsapp_status = lastWhatsappStatus
    if (lastWhatsappAt !== undefined) updates.last_whatsapp_at = lastWhatsappAt
    if (recoveryStage !== undefined) updates.recovery_stage = recoveryStage
    if (nextRecoveryAt !== undefined) updates.next_recovery_at = nextRecoveryAt
    const { error } = await supabaseAdmin.from('invoices').update(updates).eq('id', invoiceId)
    if (error) {
      return { success: false, error: error.message, executionLatencyMs: performance.now() - t0 }
    }
    return { success: true, data: { invoiceId }, executionLatencyMs: performance.now() - t0 }
  },
  semanticNormalizer: (p) => ({ invoiceId: p.invoiceId, recoveryStage: p.recoveryStage }),
}

export const reminderUpdateCadence: CapabilityProvider = {
  capabilityId: 'reminder.update_cadence.v1',
  classification: 'infrastructure',
  reversibility: 'reversible',
  blastRadius: 'tenant',
  priorityClass: 'transport',
  estimatedCost: 'low',
  estimatedLatencyMs: 50,
  externalDependencyCount: 0,
  requiresApproval: false,
  compensatable: false,
  minIntentVersion: 1,
  maxIntentVersion: 1,
  ownedMutations: [
    { table: 'invoices', columns: ['next_recovery_at'] },
  ],
  execute: async (intent) => {
    const { invoiceId, nextRecoveryAt } = intent.payload as any
    const t0 = performance.now()
    const { error } = await supabaseAdmin
      .from('invoices')
      .update({ next_recovery_at: nextRecoveryAt })
      .eq('id', invoiceId)
    if (error) {
      return { success: false, error: error.message, executionLatencyMs: performance.now() - t0 }
    }
    return { success: true, data: { invoiceId }, executionLatencyMs: performance.now() - t0 }
  },
  semanticNormalizer: (p) => ({ invoiceId: p.invoiceId, nextRecoveryAt: p.nextRecoveryAt }),
}

export const invoiceUpdateRecoveryState: CapabilityProvider = {
  capabilityId: 'invoice.update_recovery_state.v1',
  classification: 'infrastructure',
  reversibility: 'reversible',
  blastRadius: 'tenant',
  priorityClass: 'transport',
  estimatedCost: 'low',
  estimatedLatencyMs: 100,
  externalDependencyCount: 0,
  requiresApproval: false,
  compensatable: false,
  minIntentVersion: 1,
  maxIntentVersion: 1,
  ownedMutations: [
    {
      table: 'invoices',
      columns: ['recovery_flag', 'last_whatsapp_status', 'last_whatsapp_at'],
    },
  ],
  execute: async (intent) => {
    const { invoiceId, recoveryFlag, lastWhatsappStatus, lastWhatsappAt } = intent.payload as any
    const t0 = performance.now()
    const updates: Record<string, any> = {}
    if (recoveryFlag !== undefined) updates.recovery_flag = recoveryFlag
    if (lastWhatsappStatus !== undefined) updates.last_whatsapp_status = lastWhatsappStatus
    if (lastWhatsappAt !== undefined) updates.last_whatsapp_at = lastWhatsappAt
    const { error } = await supabaseAdmin.from('invoices').update(updates).eq('id', invoiceId)
    if (error) {
      return { success: false, error: error.message, executionLatencyMs: performance.now() - t0 }
    }
    return { success: true, data: { invoiceId }, executionLatencyMs: performance.now() - t0 }
  },
  semanticNormalizer: (p) => ({ invoiceId: p.invoiceId }),
}

export const invoiceCapabilities: CapabilityProvider[] = [
  invoiceMarkPaid,
  reminderAdvanceStage,
  reminderUpdateCadence,
  invoiceUpdateRecoveryState,
]
