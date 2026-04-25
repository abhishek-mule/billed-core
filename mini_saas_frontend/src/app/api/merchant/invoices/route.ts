// Merchant Invoice API
import { NextRequest, NextResponse } from 'next/server'
import { withSessionAuth, SessionData } from '@/lib/session'
import { withCsrfProtection } from '@/lib/middleware/csrf'
import { 
  validateInvoicePayload, 
  formatPhone,
  MerchantInvoicePayload,
  MerchantInvoiceResponse 
} from '@/lib/merchant'
import { calculateInvoiceTotal, formatInvoiceForWhatsApp } from '@/lib/gst'
import { getCachedCredentials } from '@/lib/db/credentials'
import { query } from '@/lib/db/client'
import { orchestrateInvoiceCreation } from '@/lib/orchestration/invoice-create'

const ERP_URL = process.env.ERP_URL || 'http://localhost'

async function handleListInvoices(request: Request, session: SessionData) {
  const { tenantId } = session

  const { searchParams } = new URL(request.url)
  const limit = Number(searchParams.get('limit') || '10')

  try {
    const dbInvoices = await query<{
      invoice_number: string
      customer_name: string
      total: string
      invoice_date: string
      erp_sync_status: string
    }>(
      `SELECT invoice_number, customer_name, total, invoice_date, erp_sync_status
       FROM invoices
       WHERE tenant_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [tenantId, limit]
    )

    if (dbInvoices.length > 0) {
      return NextResponse.json({
        invoices: dbInvoices.map((row) => ({
          name: row.invoice_number,
          customer_name: row.customer_name,
          grand_total: Number(row.total),
          posting_date: row.invoice_date,
          outstanding_amount: 0,
          sync_status: row.erp_sync_status,
        })),
      })
    }

    const creds = await getCachedCredentials(tenantId)
    const apiKey = creds?.apiKey || process.env.ERP_API_KEY || 'administrator'
    const apiSecret = creds?.apiSecret || process.env.ERP_API_SECRET || 'admin'

    const res = await fetch(
      `${ERP_URL}/api/resource/Sales Invoice?fields=["name","customer_name","grand_total","posting_date","outstanding_amount"]&filters=[["custom_tenant_id", "=", "${tenantId}"]]&limit=${limit}&order_by=creation desc`,
      {
        headers: { 'Authorization': `token ${apiKey}:${apiSecret}` },
      }
    )

    const data = await res.json()
    const invoices = Array.isArray(data.message) ? data.message : []

    return NextResponse.json({ invoices })
  } catch (error) {
    console.error('[Invoice List] Error:', error)
    return NextResponse.json({ invoices: [] }, { status: 500 })
  }
}

async function handleCreateInvoice(request: Request, session: SessionData) {
  const { tenantId, role } = session
  
  if (!['owner', 'cashier', 'accountant'].includes(role)) {
    return NextResponse.json(
      { success: false, error: 'Permission denied' },
      { status: 403 }
    )
  }
  
  try {
    const payload: MerchantInvoicePayload = await request.json()

    const validation = validateInvoicePayload(payload)
    if (!validation.valid) {
      return NextResponse.json(
        { success: false, error: validation.error },
        { status: 400 }
      )
    }

    const summary = calculateInvoiceTotal(
      payload.items.map((item) => ({
        itemCode: item.itemCode,
        itemName: item.itemName || item.itemCode,
        quantity: item.quantity,
        rate: item.rate,
      }))
    )

    const idempotencyKey = request.headers.get('x-idempotency-key') || undefined
    const orchestration = await orchestrateInvoiceCreation({
      tenantId,
      payload,
      idempotencyKey,
    })

    const whatsappMessage = formatInvoiceForWhatsApp(summary, orchestration.invoiceNumber)
    const encodedMessage = encodeURIComponent(whatsappMessage)
    const whatsappLink = `https://wa.me/91${formatPhone(payload.customerPhone)}?text=${encodedMessage}`

    const response: MerchantInvoiceResponse = {
      success: true,
      invoiceId: orchestration.invoiceId,
      invoiceNumber: orchestration.invoiceNumber,
      whatsappLink,
      message:
        orchestration.syncStatus === 'SYNCED'
          ? `Invoice ${orchestration.invoiceNumber} created for ₹${summary.total.toFixed(2)}`
          : `Invoice ${orchestration.invoiceNumber} saved. ERP sync queued for retry.`,
    }

    return NextResponse.json(response, { status: 201 })
  } catch (error) {
    console.error('[Invoice] Unexpected error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

const authHandler = await withSessionAuth(handleListInvoices)
const createHandler = await withSessionAuth(handleCreateInvoice)

export const GET = withCsrfProtection(authHandler)
export const POST = withCsrfProtection(createHandler)