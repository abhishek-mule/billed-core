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

    if (action === 'upsert') {
      if (!table || !records || !Array.isArray(records) || records.length === 0) {
        return errorResponse('Missing table or records', 400)
      }

      const results: { id: string; ok: boolean; status?: number; error?: string }[] = []

      for (const record of records) {
        const { error, status } = await supabaseAdmin
          .from(table)
          .upsert(record, { onConflict: 'id' })

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
      if (!table || !tenantId || !since) {
        return errorResponse('Missing table, tenantId, or since', 400)
      }

      const { data, error } = await supabaseAdmin
        .from(table)
        .select('*')
        .eq('tenant_id', tenantId)
        .gt('updated_at', since)
        .order('updated_at', { ascending: true })

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
