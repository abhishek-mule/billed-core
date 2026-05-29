import { supabaseAdmin } from '../../billzo/supabase-admin'
import type { Handler } from '../types'

export const gstrSaveExport: Handler = {
  domain: 'regulatory_state',
  execute: async (payload, tenantId) => {
    const { month, year, exportData, status } = payload as any
    if (!month || !year) {
      return { outcome: 'failure', error: 'month and year are required', touchedRows: [], transitionTraces: [] }
    }
    const { error } = await supabaseAdmin
      .from('gstr_exports')
      .upsert({
        tenant_id: tenantId,
        month,
        year,
        export_data: exportData,
        status: status ?? 'GENERATED',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'tenant_id,month,year' })
    if (error) {
      return { outcome: 'failure', error: error.message, touchedRows: [], transitionTraces: [] }
    }
    return {
      outcome: 'success',
      touchedRows: [{ table: 'gstr_exports', id: `${tenantId}:${month}:${year}`, changedFields: ['export_data', 'status', 'updated_at'] }],
      transitionTraces: [{ entity: 'gstr_export', entityId: `${tenantId}:${month}:${year}`, field: 'status', from: null, to: status ?? 'GENERATED', sequence: 0 }],
    }
  },
}
