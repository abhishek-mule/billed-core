import { NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/session'
import { query } from '@/lib/db/client'

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request)
  
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { tenantId } = session

  try {
    const today = new Date().toISOString().split('T')[0]

    const [todayStatsResult, pendingSyncResult, failedSyncResult] = await Promise.all([
      query(`
        SELECT 
          COALESCE(SUM(grand_total), 0) as revenue,
          COUNT(*) as invoice_count
        FROM invoices 
        WHERE tenant_id = $1 
        AND DATE(created_at) = $2
        AND status NOT IN ('CANCELLED', 'DELETED_LOGICAL')
      `, [tenantId, today]),
      
      query(`
        SELECT COUNT(*) as count
        FROM invoices 
        WHERE tenant_id = $1 
        AND erp_sync_status IN ('PENDING', 'RETRY')
        AND status NOT IN ('CANCELLED', 'DELETED_LOGICAL')
      `, [tenantId]),
      
      query(`
        SELECT COUNT(*) as count
        FROM invoices 
        WHERE tenant_id = $1 
        AND erp_sync_status = 'FAILED'
        AND status NOT IN ('CANCELLED', 'DELETED_LOGICAL')
      `, [tenantId]),
    ])

    const todayStats = todayStatsResult as any[]
    const pendingSync = pendingSyncResult as any[]
    const failedSync = failedSyncResult as any[]

    return NextResponse.json({
      revenue_today: parseFloat(todayStats[0]?.revenue || 0),
      invoice_count_today: parseInt(todayStats[0]?.invoice_count || 0),
      pending_sync_count: parseInt(pendingSync[0]?.count || 0),
      failed_sync_count: parseInt(failedSync[0]?.count || 0),
    })
  } catch (error) {
    console.error('[Today Summary] Error:', error)
    return NextResponse.json({ error: 'Failed to load' }, { status: 500 })
  }
}