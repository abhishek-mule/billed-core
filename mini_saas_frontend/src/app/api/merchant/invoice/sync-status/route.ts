import { NextResponse } from 'next/server'
import { withSessionAuth, Session } from '@/lib/session'
import { query } from '@/lib/db/client'
import { getErpSyncHistory, getErpWriteAttempt, ErpWriteAttempt } from '@/lib/invoice/erp-sync'

export async function GET(request: Request, session: Session) {
  const { tenantId } = session
  const { searchParams } = new URL(request.url)
  const limit = searchParams.get('limit') || '10'

  try {
    const invoices = await query(`
      SELECT 
        id,
        invoice_number,
        status as invoice_status,
        erp_sync_status,
        erp_synced_at,
        erp_sync_error,
        COALESCE(
          (SELECT MAX(attempt_number) FROM (
            SELECT 1 as attempt_number, tenant_id, invoice_id FROM erp_attempt
          ) WHERE tenant_id = $1 AND invoice_id = invoices.id
          ), 0
        ) as sync_attempts
      FROM invoices 
      WHERE tenant_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `, [tenantId, limit])

    const enriched = await Promise.all(
      invoices.map(async (inv: any) => {
        let syncStatus: 'PENDING' | 'SYNCING' | 'RETRYING' | 'SYNCED' | 'FAILED' = inv.erp_sync_status || 'PENDING'
        
        if (inv.sync_attempts > 0) {
          const attempt = await getErpWriteAttempt(tenantId, inv.id)
          if (attempt) {
            if (attempt.status === 'PENDING') syncStatus = 'SYNCING'
            else if (attempt.status === 'RETRY') syncStatus = 'RETRYING'
            else if (attempt.status === 'SYNCED') syncStatus = 'SYNCED'
            else if (attempt.status === 'FAILED') syncStatus = 'FAILED'
          }
        }

        return {
          id: inv.id,
          number: inv.invoice_number,
          status: inv.invoice_status,
          syncStatus,
          syncedAt: inv.erp_synced_at,
          error: inv.erp_sync_error,
          syncAttempts: inv.sync_attempts,
        }
      })
    )

    return NextResponse.json({ invoices: enriched })
  } catch (error) {
    console.error('[Sync Status] Error:', error)
    return NextResponse.json({ error: 'Failed to load sync status' }, { status: 500 })
  }
}

export const GET = withSessionAuth(GET)