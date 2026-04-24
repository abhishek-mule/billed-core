// Merchant Invoice API
import { NextRequest, NextResponse } from 'next/server'
import { withSessionAuth, Session } from '@/lib/session'
import { withCsrfProtection } from '@/lib/middleware/csrf'
import { 
  validateInvoicePayload, 
  generateInvoiceNumber, 
  generateCustomerId,
  formatPhone,
  MerchantInvoicePayload,
  MerchantInvoiceResponse 
} from '@/lib/merchant'
import { calculateInvoiceTotal, formatInvoiceForWhatsApp } from '@/lib/gst'
import { getCachedCredentials } from '@/lib/db/credentials'

const ERP_URL = process.env.ERP_URL || 'http://localhost'

async function handleListInvoices(request: Request, session: Session) {
  const { tenantId } = session
  const creds = await getCachedCredentials(tenantId)
  
  const apiKey = creds?.apiKey || process.env.ERP_API_KEY || 'administrator'
  const apiSecret = creds?.apiSecret || process.env.ERP_API_SECRET || 'admin'

  const { searchParams } = new URL(request.url)
  const limit = searchParams.get('limit') || '10'

  try {
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

async function handleCreateInvoice(request: NextRequest, session: Session) {
  const { tenantId, role } = session
  
  if (!['owner', 'cashier', 'accountant'].includes(role)) {
    return NextResponse.json(
      { success: false, error: 'Permission denied' },
      { status: 403 }
    )
  }
  
  const creds = await getCachedCredentials(tenantId)
  
  const apiKey = creds?.apiKey || process.env.ERP_API_KEY || 'administrator'
  const apiSecret = creds?.apiSecret || process.env.ERP_API_SECRET || 'admin'
  const erpSite = creds?.erpSite || 'default'

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

    const invoiceNumber = generateInvoiceNumber()
    const customerId = generateCustomerId(payload.customerPhone)

    const invoiceData = {
      doctype: 'Sales Invoice',
      customer: customerId,
      customer_name: payload.customerName || `Customer ${formatPhone(payload.customerPhone)}`,
      company: erpSite,
      posting_date: new Date().toISOString().slice(0, 10),
      due_date: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      items: summary.items.map((item) => ({
        item_code: item.itemCode,
        item_name: item.itemName,
        qty: item.quantity,
        rate: item.rate,
        amount: item.amount,
      })),
      custom_invoice_number: invoiceNumber,
      remarks: payload.notes || '',
      custom_tenant_id: tenantId,
      is_pos: 0,
      do_not_submit: false,
    }

    const frappeRes = await fetch(`${ERP_URL}/api/resource/Sales Invoice`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `token ${apiKey}:${apiSecret}`,
      },
      body: JSON.stringify(invoiceData),
    })

    if (!frappeRes.ok) {
      const errorData = await frappeRes.json().catch(() => ({}))
      console.error('[Invoice] Frappe error:', errorData)
      return NextResponse.json(
        { success: false, error: 'Failed to create invoice in billing system' },
        { status: 500 }
      )
    }

    const frappeData = await frappeRes.json()
    const invoiceId = frappeData.data?.name || invoiceNumber

    const whatsappMessage = formatInvoiceForWhatsApp(summary, invoiceNumber)
    const encodedMessage = encodeURIComponent(whatsappMessage)
    const whatsappLink = `https://wa.me/91${formatPhone(payload.customerPhone)}?text=${encodedMessage}`

    const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL
    if (n8nWebhookUrl) {
      fetch(`${n8nWebhookUrl}/invoice-created`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceId,
          invoiceNumber,
          customerPhone: payload.customerPhone,
          customerName: payload.customerName,
          total: summary.total,
          merchant: {
            tenantId,
            erpSite,
          },
          timestamp: new Date().toISOString(),
        }),
      }).catch((err) => console.warn('[Invoice] n8n webhook failed:', err))
    }

    const response: MerchantInvoiceResponse = {
      success: true,
      invoiceId,
      invoiceNumber,
      whatsappLink,
      message: `Invoice ${invoiceNumber} created for ₹${summary.total.toFixed(2)}`,
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