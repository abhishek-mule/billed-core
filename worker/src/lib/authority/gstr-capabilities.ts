import { supabaseAdmin } from '../billzo/supabase-admin'
import type { CapabilityProvider } from './schemas'

export const gstrSaveExport: CapabilityProvider = {
  capabilityId: 'gstr.save_export.v1',
  classification: 'regulatory',
  reversibility: 'reversible',
  blastRadius: 'tenant',
  priorityClass: 'regulatory',
  estimatedCost: 'low',
  estimatedLatencyMs: 150,
  externalDependencyCount: 1,
  requiresApproval: false,
  compensatable: false,
  minIntentVersion: 1,
  maxIntentVersion: 1,
  ownedMutations: [
    { table: 'gstr_exports', columns: undefined },
  ],
  execute: async (intent) => {
    const { tenantId, month, year, exportData, status } = intent.payload as any
    const t0 = performance.now()
    const { error } = await supabaseAdmin
      .from('gstr_exports')
      .upsert({
        tenant_id: tenantId ?? intent.tenantId,
        month,
        year,
        export_data: exportData,
        status: status ?? 'GENERATED',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'tenant_id,month,year' })
    if (error) {
      return { success: false, error: error.message, executionLatencyMs: performance.now() - t0 }
    }
    return { success: true, data: { tenantId: tenantId ?? intent.tenantId, month, year }, executionLatencyMs: performance.now() - t0 }
  },
  semanticNormalizer: (p) => ({ tenantId: p.tenantId, month: p.month, year: p.year }),
}

export const gstrCapabilities: CapabilityProvider[] = [
  gstrSaveExport,
]
