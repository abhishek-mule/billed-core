import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/session'
import { query } from '@/lib/db/client'

interface ERPNextInvoice {
  doctype: string
  name?: string
  naming_series: string
  customer: string
  posting_date: string
  due_date?: string
  items: Array<{
    item_code: string
    item_name: string
    qty: number
    rate: number
    amount: number
  }>
  taxes: Array<{
    charge_type: string
    account_head: string
    rate: number
    tax_amount: number
  }>
  total: number
  grand_total: number
  custom_billzo_invoice_id: string
  custom_tenant_id: string
}

interface ERPCredentials {
  erpUrl: string
  apiKey: string
  apiSecret: string
}

async function getERPCredentials(tenantId: string): Promise<ERPCredentials> {
  // Check environment variables first
  const erpUrl = process.env.ERP_URL || ''
  const apiKey = process.env.ERP_API_KEY || ''
  const apiSecret = process.env.ERP_API_SECRET || ''

  if (!erpUrl || !apiKey || !apiSecret) {
    throw new Error(
      'ERPNext credentials not configured. Add ERP_URL, ERP_API_KEY, ERP_API_SECRET to environment variables'
    )
  }

  return { erpUrl, apiKey, apiSecret }
}

async function buildERPInvoice(invoiceId: string, tenantId: string): Promise<ERPNextInvoice> {
  // Get invoice from BillZo
  const invoice = await query<Record<string, any>>(
    `SELECT 
       id, invoice_number, customer_name, customer_id, created_at,
       subtotal, cgst, sgst, igst, grand_total, line_items_json, due_date
     FROM invoices
     WHERE id = $1 AND tenant_id = $2`,
    [invoiceId, tenantId]
  )

  if (!invoice.length) {
    throw new Error('Invoice not found')
  }

  const inv = invoice[0]

  // Parse line items
  let lineItems = []
  try {
    const itemsJson = typeof inv.line_items_json === 'string'
      ? JSON.parse(inv.line_items_json)
      : inv.line_items_json || []
    lineItems = Array.isArray(itemsJson) ? itemsJson : Object.values(itemsJson)
  } catch (e) {
    console.warn('Could not parse line items:', e)
    lineItems = []
  }

  // Build ERPNext invoice format
  const erpInvoice: ERPNextInvoice = {
    doctype: 'Sales Invoice',
    naming_series: 'ACC-SINV-.YYYY.-',
    customer: inv.customer_name,
    posting_date: new Date(inv.created_at).toISOString().split('T')[0],
    due_date: inv.due_date ? new Date(inv.due_date).toISOString().split('T')[0] : undefined,
    items: lineItems.map((item: any) => ({
      item_code: item.item_code || item.item_name,
      item_name: item.item_name,
      qty: Number(item.quantity),
      rate: Number(item.rate),
      amount: Number(item.amount),
    })),
    taxes: [
      ...(Number(inv.cgst) > 0 ? [{
        charge_type: 'On Net Total',
        account_head: 'CGST - C',
        rate: 9,
        tax_amount: Number(inv.cgst),
      }] : []),
      ...(Number(inv.sgst) > 0 ? [{
        charge_type: 'On Net Total',
        account_head: 'SGST - C',
        rate: 9,
        tax_amount: Number(inv.sgst),
      }] : []),
      ...(Number(inv.igst) > 0 ? [{
        charge_type: 'On Net Total',
        account_head: 'IGST - C',
        rate: 18,
        tax_amount: Number(inv.igst),
      }] : []),
    ],
    total: Number(inv.subtotal),
    grand_total: Number(inv.grand_total),
    custom_billzo_invoice_id: invoiceId,
    custom_tenant_id: tenantId,
  }

  return erpInvoice
}

async function syncToERP(credentials: ERPCredentials, erpInvoice: ERPNextInvoice): Promise<string> {
  const { erpUrl, apiKey, apiSecret } = credentials

  // Create auth header
  const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')

  const response = await fetch(`${erpUrl}/api/resource/Sales Invoice`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${auth}`,
    },
    body: JSON.stringify({ data: erpInvoice }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`ERPNext API error: ${response.status} - ${error}`)
  }

  const data = await response.json()
  return data.data?.name || ''
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const { tenantId } = session
      const body = await req.json()
      const { invoice_id, action } = body

      if (!invoice_id) {
        return NextResponse.json(
          { error: 'Missing invoice_id' },
          { status: 400 }
        )
      }

      // Check if ERPNext is configured
      try {
        await getERPCredentials(session.tenantId)
      } catch (configError) {
        return NextResponse.json(
          {
            success: false,
            error: configError instanceof Error ? configError.message : 'ERP not configured',
            hint: 'Please configure ERPNext credentials in environment variables',
          },
          { status: 400 }
        )
      }

      if (action === 'status') {
        // Just check sync status without syncing
        const result = await query<{ erp_sync_status: string; erp_invoice_id: string }>(
          `SELECT erp_sync_status, erp_invoice_id FROM invoices WHERE id = $1`,
          [invoice_id]
        )
        
        return NextResponse.json({
          success: true,
          sync_status: result[0]?.erp_sync_status || 'UNKNOWN',
          erp_invoice_id: result[0]?.erp_invoice_id,
        })
      }

      if (action === 'sync' || !action) {
        // Build and sync invoice
        const erpInvoice = await buildERPInvoice(invoice_id, session.tenantId)
        
        // Try to sync (this will fail if credentials are mock/invalid, which is OK for Phase 1)
        try {
          const credentials = await getERPCredentials(session.tenantId)
          const erpId = await syncToERP(credentials, erpInvoice)

          // Update local invoice with sync status
          await query(
            `UPDATE invoices SET erp_sync_status = 'SYNCED', erp_invoice_id = $1, updated_at = NOW()
             WHERE id = $2`,
            [erpId, invoice_id]
          )

          return NextResponse.json({
            success: true,
            message: `Invoice synced to ERPNext: ${erpId}`,
            erp_invoice_id: erpId,
            erpnext_url: `${process.env.ERP_URL}/app/sales-invoice/${erpId}`,
          })
        } catch (syncError) {
          // Mark as retry-pending, don't fail
          await query(
            `UPDATE invoices SET erp_sync_status = 'RETRY', updated_at = NOW()
             WHERE id = $1`,
            [invoice_id]
          )

          return NextResponse.json({
            success: false,
            error: syncError instanceof Error ? syncError.message : 'Sync failed',
            status: 'marked_for_retry',
          }, { status: 400 })
        }
      }

      return NextResponse.json(
        { error: 'Invalid action' },
        { status: 400 }
      )
    } catch (error) {
      console.error('[ERP Sync] Error:', error)
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Sync failed' },
        { status: 500 }
      )
  }
}
