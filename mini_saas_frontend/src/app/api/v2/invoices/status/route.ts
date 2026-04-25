import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/session'
import { query, queryOne } from '@/lib/db/client'

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const invoiceId = searchParams.get('id')

    if (invoiceId) {
      // Get single invoice status
      const invoice = await queryOne<any>(
        'SELECT * FROM invoices WHERE id = $1 AND tenant_id = $2',
        [invoiceId, session.tenantId]
      )

      if (!invoice) {
        return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
      }

      return NextResponse.json({
        success: true,
        invoice: {
          id: invoice.id,
          number: invoice.invoice_number,
          customerName: invoice.customer_name,
          total: invoice.total,
          syncStatus: invoice.erp_sync_status,
          erpInvoiceId: invoice.erp_invoice_id,
          syncedAt: invoice.erp_synced_at,
          error: invoice.erp_sync_error,
          createdAt: invoice.created_at,
        },
      })
    }

    // Get all sync statuses
    const stats = await query(`
      SELECT 
        erp_sync_status as status,
        COUNT(*) as count
      FROM invoices 
      WHERE tenant_id = $1 
      GROUP BY erp_sync_status
    `, [session.tenantId])

    const pending = stats.find((s: any) => s.status === 'PENDING')
    const synced = stats.find((s: any) => s.status === 'SYNCED')
    const failed = stats.find((s: any) => s.status === 'FAILED')

    return NextResponse.json({
      success: true,
      summary: {
        total: stats.reduce((sum: number, s: any) => sum + parseInt(s.count), 0),
        synced: parseInt(synced?.count || 0),
        pending: parseInt(pending?.count || 0),
        failed: parseInt(failed?.count || 0),
      },
    })

  } catch (error: any) {
    console.error('[Invoice Status] Error:', error)
    return NextResponse.json(
      { error: 'Failed to get status' },
      { status: 500 }
    )
  }
}