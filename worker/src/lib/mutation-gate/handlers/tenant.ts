import { supabaseAdmin } from '../../billzo/supabase-admin'
import type { Handler } from '../types'

function now(): string {
  return new Date().toISOString()
}

export const tenantUpdateSubscription: Handler = {
  domain: 'entity_state',
  execute: async (payload, tenantId) => {
    const { plan, planStatus, subscriptionId, paywallUnlocked, cancelledAt, updatedAt } = payload as any
    const updates: Record<string, any> = {}
    if (plan !== undefined) updates.plan = plan
    if (planStatus !== undefined) updates.subscription_status = planStatus
    if (subscriptionId !== undefined) updates.subscription_id = subscriptionId
    if (paywallUnlocked !== undefined) updates.paywall_unlocked = paywallUnlocked
    if (cancelledAt !== undefined) updates.cancelled_at = cancelledAt
    updates.updated_at = updatedAt ?? now()
    const { error } = await supabaseAdmin
      .from('tenants')
      .update(updates)
      .eq('id', tenantId)
    if (error) {
      return { outcome: 'failure', error: error.message, touchedRows: [], transitionTraces: [] }
    }
    const changed = Object.keys(updates)
    return {
      outcome: 'success',
      touchedRows: [{ table: 'tenants', id: tenantId, changedFields: changed }],
      transitionTraces: changed.map((f, i) => ({
        entity: 'tenant', entityId: tenantId, field: f, from: null, to: String(updates[f]), sequence: i,
      })),
    }
  },
}

export const tenantUpdateWhatsappConfig: Handler = {
  domain: 'communication_state',
  execute: async (payload, tenantId) => {
    const { whatsappConfig } = payload as any
    const updates: Record<string, any> = { whatsapp_config: whatsappConfig ?? undefined, updated_at: now() }
    const { error } = await supabaseAdmin
      .from('tenants')
      .update(updates)
      .eq('id', tenantId)
    if (error) {
      return { outcome: 'failure', error: error.message, touchedRows: [], transitionTraces: [] }
    }
    return {
      outcome: 'success',
      touchedRows: [{ table: 'tenants', id: tenantId, changedFields: ['whatsapp_config', 'updated_at'] }],
      transitionTraces: [
        { entity: 'tenant', entityId: tenantId, field: 'whatsapp_config', from: null, to: 'updated', sequence: 0 },
      ],
    }
  },
}

export const tenantUpdateOperationalHealth: Handler = {
  domain: 'entity_state',
  execute: async (payload, tenantId) => {
    const { whatsappReputation } = payload as any
    const { error } = await supabaseAdmin
      .from('tenants')
      .update({ whatsapp_reputation: whatsappReputation ?? undefined })
      .eq('id', tenantId)
    if (error) {
      return { outcome: 'failure', error: error.message, touchedRows: [], transitionTraces: [] }
    }
    return {
      outcome: 'success',
      touchedRows: [{ table: 'tenants', id: tenantId, changedFields: ['whatsapp_reputation'] }],
      transitionTraces: [{ entity: 'tenant', entityId: tenantId, field: 'whatsapp_reputation', from: null, to: String(whatsappReputation), sequence: 0 }],
    }
  },
}
