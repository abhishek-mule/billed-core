import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import { verifyRequest, errorResponse } from '@/lib/billzo/api-middleware'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyRequest(request)
    if (auth.response) return auth.response

    let body: any
    try {
      body = await request.json()
    } catch {
      return errorResponse('Invalid JSON request body', 400)
    }

    const { action, table, records, tenantId, since } = body

    // Tenant-isolation: the JWT-verified tenant is authoritative. A body-supplied
    // tenantId is a hint at most — never proof (cross-tenant dump primitive).
    const authTenantId = auth.tenantId!
    if (tenantId !== undefined && tenantId !== authTenantId) {
      return errorResponse('tenantId mismatch', 403)
    }

    // Allowlist: service-role client must never touch arbitrary tables.
    // Only offline-first client cache tables sync through this proxy.
    const SYNC_TABLES = new Set([
      'customers',
      'invoices',
      'invoice_items',
      'payments',
      'products',
      'purchases',
      'inventory_movements',
      'whatsapp_events',
      'recovery_cases',
      'recovery_attributions',
      'recovery_activities',
      'promises',
    ])
    if (!table || !SYNC_TABLES.has(table)) {
      return errorResponse('Unknown or non-syncable table', 400)
    }

    if (action === 'upsert') {
      if (!records || !Array.isArray(records) || records.length === 0) {
        return errorResponse('Missing table or records', 400)
      }
      if (records.length > 200) {
        return errorResponse('Too many records (max 200 per batch)', 400)
      }

      const results: { id: string; ok: boolean; status?: number; error?: string }[] = []

      for (const record of records) {
        // Every synced record must belong to the caller's tenant — a record
        // carrying a foreign tenant_id is rejected, never written.
        const recordTenant = (record as any)?.tenant_id ?? (record as any)?.tenantId
        if (recordTenant !== undefined && recordTenant !== authTenantId) {
          results.push({ id: (record as any)?.id || 'unknown', ok: false, error: 'tenant mismatch' })
          continue
        }
        const scoped = { ...(record as object), tenant_id: authTenantId } as Record<string, unknown>
        const { error, status } = await supabaseAdmin
          .from(table)
          .upsert(scoped, { onConflict: 'id' })

        results.push({
          id: record.id || 'unknown',
          ok: !error,
          status,
          error: error?.message,
        })
      }

      return NextResponse.json({ success: true, results })
    }

    if (action === 'reconcile') {
      if (!table || !since) {
        return errorResponse('Missing table or since', 400)
      }

      const { data, error } = await supabaseAdmin
        .from(table)
        .select('*')
        .eq('tenant_id', authTenantId)
        .gt('updated_at', since)
        .order('updated_at', { ascending: true })
        .limit(500)

      if (error) {
        return errorResponse(error.message, 500)
      }

      return NextResponse.json({ success: true, data: data || [] })
    }

    return errorResponse(`Unknown action: ${action}`, 400)
  } catch (err: any) {
    console.error('[SyncProxy] Error:', err)
    return errorResponse('Internal server error', 500)
  }
}
