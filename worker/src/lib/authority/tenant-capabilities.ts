import { supabaseAdmin } from '../billzo/supabase-admin'
import type { CapabilityProvider } from './schemas'

function now(): string {
  return new Date().toISOString()
}

export const tenantUpdateSubscription: CapabilityProvider = {
  capabilityId: 'tenant.update_subscription.v1',
  classification: 'infrastructure',
  reversibility: 'reversible',
  blastRadius: 'tenant',
  priorityClass: 'tenant_lifecycle',
  estimatedCost: 'low',
  estimatedLatencyMs: 100,
  externalDependencyCount: 0,
  requiresApproval: false,
  compensatable: true,
  minIntentVersion: 1,
  maxIntentVersion: 1,
  ownedMutations: [
    { table: 'tenants', columns: ['plan', 'subscription_status', 'subscription_id', 'paywall_unlocked', 'cancelled_at', 'updated_at'] },
  ],
  execute: async (intent) => {
    const { plan, planStatus, subscriptionId, paywallUnlocked, cancelledAt, updatedAt } = intent.payload as any
    const t0 = performance.now()
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
      .eq('id', intent.tenantId)
    if (error) {
      return { success: false, error: error.message, executionLatencyMs: performance.now() - t0 }
    }
    return { success: true, data: { tenantId: intent.tenantId }, executionLatencyMs: performance.now() - t0 }
  },
  compensate: async (intent) => {
    return { success: true }
  },
  semanticNormalizer: (p) => ({ tenantId: p.tenantId, plan: p.plan }),
}

export const tenantUpdateWhatsappConfig: CapabilityProvider = {
  capabilityId: 'tenant.update_whatsapp_config.v1',
  classification: 'infrastructure',
  reversibility: 'reversible',
  blastRadius: 'tenant',
  priorityClass: 'transport',
  estimatedCost: 'low',
  estimatedLatencyMs: 100,
  externalDependencyCount: 0,
  requiresApproval: false,
  compensatable: true,
  minIntentVersion: 1,
  maxIntentVersion: 1,
  ownedMutations: [
    { table: 'tenants', columns: ['whatsapp_config', 'updated_at'] },
  ],
  execute: async (intent) => {
    const { whatsappConfig } = intent.payload as any
    const t0 = performance.now()
    const { error } = await supabaseAdmin
      .from('tenants')
      .update({ whatsapp_config: whatsappConfig ?? undefined, updated_at: now() })
      .eq('id', intent.tenantId)
    if (error) {
      return { success: false, error: error.message, executionLatencyMs: performance.now() - t0 }
    }
    return { success: true, data: { tenantId: intent.tenantId }, executionLatencyMs: performance.now() - t0 }
  },
  compensate: async (intent) => {
    return { success: true }
  },
  semanticNormalizer: (p) => ({ tenantId: p.tenantId }),
}

export const tenantUpdateOperationalHealth: CapabilityProvider = {
  capabilityId: 'tenant.update_operational_health.v1',
  classification: 'infrastructure',
  reversibility: 'reversible',
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
    { table: 'tenants', columns: ['whatsapp_reputation'] },
  ],
  execute: async (intent) => {
    const { whatsappReputation } = intent.payload as any
    const t0 = performance.now()
    const { error } = await supabaseAdmin
      .from('tenants')
      .update({ whatsapp_reputation: whatsappReputation ?? undefined })
      .eq('id', intent.tenantId)
    if (error) {
      return { success: false, error: error.message, executionLatencyMs: performance.now() - t0 }
    }
    return { success: true, data: { tenantId: intent.tenantId }, executionLatencyMs: performance.now() - t0 }
  },
  semanticNormalizer: (p) => ({ tenantId: p.tenantId }),
}

export const tenantCapabilities: CapabilityProvider[] = [
  tenantUpdateSubscription,
  tenantUpdateWhatsappConfig,
  tenantUpdateOperationalHealth,
]
