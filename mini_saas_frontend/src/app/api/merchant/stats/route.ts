import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/session'
import { query, queryOne } from '@/lib/db/client'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { tenantId } = session

    // Get today's revenue
    const revenueResult = await queryOne<{ total: string }>(
      `SELECT SUM(total::numeric) as total 
       FROM invoices 
       WHERE tenant_id = $1 AND invoice_date = CURRENT_DATE`,
      [tenantId]
    )

    // Get today's invoice count
    const countResult = await queryOne<{ count: string }>(
      `SELECT COUNT(*) as count 
       FROM invoices 
       WHERE tenant_id = $1 AND invoice_date = CURRENT_DATE`,
      [tenantId]
    )

    // Get sync status counts
    const syncStats = await query<{ status: string, count: string }>(
      `SELECT erp_sync_status as status, COUNT(*) as count 
       FROM invoices 
       WHERE tenant_id = $1 AND invoice_date = CURRENT_DATE 
       GROUP BY erp_sync_status`,
      [tenantId]
    )

    // Get recent invoices
    const recentInvoices = await query<any>(
      `SELECT id, invoice_number, customer_name, total, erp_sync_status, created_at 
       FROM invoices 
       WHERE tenant_id = $1 
       ORDER BY created_at DESC 
       LIMIT 5`,
      [tenantId]
    )

    const stats = {
      revenue: parseFloat(revenueResult?.total || '0'),
      invoiceCount: parseInt(countResult?.count || '0'),
      syncedCount: parseInt(syncStats.find(s => s.status === 'SYNCED')?.count || '0'),
      failedCount: parseInt(syncStats.find(s => s.status === 'FAILED')?.count || '0'),
      pendingCount: parseInt(syncStats.find(s => s.status === 'PENDING')?.count || '0'),
    }

    return NextResponse.json({
      success: true,
      stats,
      recentInvoices: recentInvoices.map(inv => ({
        id: inv.id,
        number: inv.invoice_number,
        party: inv.customer_name,
        amount: parseFloat(inv.total),
        status: inv.erp_sync_status.toLowerCase(),
        date: inv.created_at
      }))
    })

  } catch (error: any) {
    console.error('[Dashboard Stats] Error:', error)
    return NextResponse.json({ error: 'Failed to load dashboard stats' }, { status: 500 })
  }
}