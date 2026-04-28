import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/session'
import { query, queryOne } from '@/lib/db/client'
import { getCachedCredentials } from '@/lib/db/credentials'

const ERP_URL = process.env.ERP_URL || 'http://localhost'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const invoiceId = params.id
    const { tenantId } = session

    console.log(`[Retry] Attempting to sync invoice ${invoiceId}`)

    const invoice = await queryOne<Record<string, any>>(
      `SELECT id, invoice_number, grand_total, erp_sync_status
       FROM invoices WHERE id = $1 AND tenant_id = $2`,
      [invoiceId, tenantId]
    )

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    if (invoice.erp_sync_status === 'SYNCED') {
      return NextResponse.json({ 
        success: true, 
        message: 'Invoice already synced',
        status: 'SYNCED'
      })
    }

    // Get invoice items
    const items = await query<Record<string, any>>(
      `SELECT item_name, quantity, rate, amount, hsn_code, gst_rate
       FROM invoice_items WHERE invoice_id = $1`,
      [invoiceId]
    )

    // Try to sync to ERP
    let syncSuccess = false
    let erpError = null

    try {
      const creds = await getCachedCredentials(tenantId)
      const apiKey = creds?.apiKey || process.env.ERP_API_KEY || 'administrator'
      const apiSecret = creds?.apiSecret || process.env.ERP_API_SECRET || 'admin'

      const payload = {
        doctype: 'Sales Invoice',
        data: {
          customer_name: invoice.customer_name,
          posting_date: invoice.invoice_date,
          due_date: invoice.due_date,
          grand_total: invoice.grand_total,
          items: items.map(item => ({
            item_name: item.item_name,
            qty: item.quantity,
            rate: item.rate,
            amount: item.amount,
            income_account: 'Sales - TP',
            cost_center: 'Main - TP'
          }))
        }
      }

      const res = await fetch(`${ERP_URL}/api/resource/Sales Invoice`, {
        method: 'POST',
        headers: {
          'Authorization': `token ${apiKey}:${apiSecret}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      })

      if (res.ok) {
        syncSuccess = true
        console.log(`[Retry] Successfully synced invoice ${invoiceId}`)
      } else {
        const errorData = await res.json()
        erpError = errorData.message || 'ERP sync failed'
        console.error(`[Retry] ERP error for ${invoiceId}:`, erpError)
      }
    } catch (erpErr: any) {
      erpErr.message && console.error(`[Retry] Network error for ${invoiceId}:`, erpErr.message)
      erpError = erpErr.message || 'Network error'
    }

    // Update sync status
    const newStatus = syncSuccess ? 'SYNCED' : 'FAILED'
    await query(
      `UPDATE invoices SET erp_sync_status = $1, sync_error = $2, updated_at = NOW()
       WHERE id = $3 AND tenant_id = $4`,
      [newStatus, erpError, invoiceId, tenantId]
    )

    if (syncSuccess) {
      return NextResponse.json({ 
        success: true, 
        message: 'Invoice synced successfully',
        status: 'SYNCED'
      })
    } else {
      return NextResponse.json({ 
        success: false, 
        error: erpError || 'Sync failed',
        status: 'FAILED',
        retry_after: 30000
      })
    }

  } catch (error) {
    console.error('[Retry] Error:', error)
    return NextResponse.json({ error: 'Retry failed' }, { status: 500 })
  }
}