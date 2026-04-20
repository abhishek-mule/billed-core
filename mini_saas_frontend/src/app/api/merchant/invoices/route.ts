// Merchant Invoice Creation API
import { NextRequest, NextResponse } from 'next/server'
import { withMerchantAuth, extractMerchantContext, MerchantContext } from '@/app/api/middleware/auth'
import { 
  validateInvoicePayload, 
  generateInvoiceNumber, 
  generateCustomerId,
  formatPhone,
  MerchantInvoicePayload,
  MerchantInvoiceResponse 
} from '@/lib/merchant'
import { calculateInvoiceTotal, formatInvoiceForWhatsApp } from '@/lib/gst'

async function handleCreateInvoice(request: NextRequest): Promise<NextResponse> {
  const merchant = await extractMerchantContext(request)
  if (!merchant) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
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

    const invoiceNumber = generateInvoiceNumber()
    const customerId = generateCustomerId(payload.customerPhone)

    const invoiceData = {
      doctype: 'Sales Invoice',
      customer: customerId,
      customer_name: payload.customerName || `Customer ${formatPhone(payload.customerPhone)}`,
      company: merchant.companyName,
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
      is_pos: 0,
      do_not_submit: false,
    }

    const sidecarUrl = process.env.PROVISIONING_SIDECAR_URL || 'http://localhost:8001'
    const frappe_call = await fetch(`${sidecarUrl}/api/invoices/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Merchant-Site': merchant.siteName,
        'X-Merchant-Company': merchant.companyName,
        'Authorization': `Bearer ${merchant.apiKey}`,
      },
      body: JSON.stringify(invoiceData),
    })

    if (!frappe_call.ok) {
      const errorData = await frappe_call.json().catch(() => ({}))
      console.error('[Invoice API] Frappe error:', errorData)
      return NextResponse.json(
        { success: false, error: 'Failed to create invoice in billing system' },
        { status: 500 }
      )
    }

    const frappeResponse = await frappe_call.json()
    const invoiceId = frappeResponse.data?.name || invoiceNumber

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
            tenantId: merchant.tenantId,
            companyName: merchant.companyName,
          },
          timestamp: new Date().toISOString(),
        }),
      }).catch((err) => console.warn('[Invoice API] n8n webhook failed:', err))
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
    console.error('[Invoice API] Unexpected error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export const POST = withMerchantAuth(handleCreateInvoice)