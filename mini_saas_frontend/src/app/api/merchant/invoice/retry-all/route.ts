import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/session'
import { query, queryOne } from '@/lib/db/client'
import { getCachedCredentials } from '@/lib/db/credentials'

const ERP_URL = process.env.ERP_URL || 'http://localhost'

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { tenantId } = session
    console.log(`[Retry All] Processing for tenant ${tenantId}`)

    // Get all failed invoices
    const failedInvoices = await query<Record<string, any>>(
      `SELECT id, invoice_number, erp_sync_status
       FROM invoices 
       WHERE tenant_id = $1 AND erp_sync_status = 'FAILED'
       ORDER BY created_at DESC
       LIMIT 20`,
      [tenantId]
    )

    if (failedInvoices.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: 'No failed invoices to retry',
        processed: 0,
        succeeded: 0,
        failed: 0
      })
    }

    console.log(`[Retry All] Found ${failedInvoices.length} failed invoices`)

    let succeeded = 0
    let failed = 0

    for (const inv of failedInvoices) {
      try {
        // Get invoice items
        const items = await query<Record<string, any>>(
          `SELECT item_name, quantity, rate, amount
           FROM invoice_items WHERE invoice_id = $1`,
          [inv.id]
        )

        const creds = await getCachedCredentials(tenantId)
        const apiKey = creds?.apiKey || process.env.ERP_API_KEY || 'administrator'
        const apiSecret = creds?.apiSecret || process.env.ERP_API_SECRET || 'admin'

        const res = await fetch(`${ERP_URL}/api/resource/Sales Invoice`, {
          method: 'POST',
          headers: {
            'Authorization': `token ${apiKey}:${apiSecret}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            doctype: 'Sales Invoice',
            data: {
              customer_name: inv.customer_name || 'Walk-in',
              grand_total: inv.grand_total,
              items: items.map(i => ({
                item_name: i.item_name,
                qty: i.quantity,
                rate: i.rate,
                amount: i.amount
              }))
            }
          })
        })

        if (res.ok) {
          await query(
            `UPDATE invoices SET erp_sync_status = 'SYNCED', sync_error = NULL, updated_at = NOW()
             WHERE id = $1 AND tenant_id = $2`,
            [inv.id, tenantId]
          )
          succeeded++
        } else {
          failed++
        }
      } catch (err) {
        console.error(`[Retry All] Failed for ${inv.invoice_number}:`, err)
        failed++
      }
    }

    console.log(`[Retry All] Results: ${succeeded} succeeded, ${failed} failed`)

    return NextResponse.json({
      success: true,
      processed: failedInvoices.length,
      succeeded,
      failed,
      remaining: failedInvoices.length - succeeded - failed
    })

  } catch (error) {
    console.error('[Retry All] Error:', error)
    return NextResponse.json({ error: 'Batch retry failed' }, { status: 500 })
  }
}