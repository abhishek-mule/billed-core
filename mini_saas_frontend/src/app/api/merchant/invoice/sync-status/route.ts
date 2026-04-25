import { NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/session'
import { query } from '@/lib/db/client'
import { getErpWriteAttempt } from '@/lib/invoice/erp-sync'

interface SyncRow {
  id: string
  invoice_number: string
  invoice_status: string
  erp_sync_status: 'PENDING' | 'SYNCED' | 'FAILED' | 'RETRY' | null
  erp_synced_at: string | null
  erp_sync_error: string | null
}

async function handler(request: Request) {
  const session = await getSessionFromRequest(request)
  
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { tenantId } = session
  const { searchParams } = new URL(request.url)
  const limit = Number(searchParams.get('limit') || '10')

  try {
    const invoices = await query<SyncRow>(`
      SELECT 
        id,
        invoice_number,
        status as invoice_status,
        erp_sync_status,
        erp_synced_at,
        erp_sync_error
      FROM invoices 
      WHERE tenant_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `, [tenantId, limit])

    const enriched = await Promise.all(
      invoices.map(async (inv) => {
        let syncStatus: 'PENDING' | 'SYNCING' | 'RETRYING' | 'SYNCED' | 'FAILED' = 'PENDING'
        if (inv.erp_sync_status === 'SYNCED') syncStatus = 'SYNCED'
        else if (inv.erp_sync_status === 'FAILED') syncStatus = 'FAILED'
        else if (inv.erp_sync_status === 'RETRY') syncStatus = 'RETRYING'
        else if (inv.erp_sync_status === 'PENDING') syncStatus = 'PENDING'
        
        const attempt = await getErpWriteAttempt(tenantId, inv.id)
        if (attempt) {
          if (attempt.status === 'PENDING') syncStatus = 'SYNCING'
          else if (attempt.status === 'RETRY') syncStatus = 'RETRYING'
          else if (attempt.status === 'SYNCED') syncStatus = 'SYNCED'
          else if (attempt.status === 'FAILED') syncStatus = 'FAILED'
        }

        return {
          id: inv.id,
          number: inv.invoice_number,
          status: inv.invoice_status,
          syncStatus,
          syncedAt: inv.erp_synced_at,
          error: inv.erp_sync_error,
        }
      })
    )

    return NextResponse.json({ invoices: enriched })
  } catch (error) {
    console.error('[Sync Status] Error:', error)
    return NextResponse.json({ error: 'Failed to load sync status' }, { status: 500 })
  }
}

export { handler as GET }