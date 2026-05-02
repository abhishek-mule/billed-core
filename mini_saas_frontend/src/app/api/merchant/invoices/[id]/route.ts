import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/session'
import { queryOne } from '@/lib/db/client'
import { formatPhone } from '@/lib/merchant'
import { formatInvoiceForWhatsApp } from '@/lib/gst'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = params

    // Fetch Invoice with line items
    const invoice = await queryOne<any>(
      `SELECT * FROM invoices WHERE id = $1 AND tenant_id = $2`,
      [id, session.tenantId]
    )

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    // Generate WhatsApp link dynamically if missing or for refresh
    const summary = {
      total: Number(invoice.total),
      subtotal: Number(invoice.subtotal),
      taxAmount: Number(invoice.tax_amount),
      items: invoice.line_items_json
    }
    const whatsappMessage = formatInvoiceForWhatsApp(summary as any, invoice.invoice_number)
    const encodedMessage = encodeURIComponent(whatsappMessage)
    const whatsappLink = `https://wa.me/91${formatPhone(invoice.customer_phone)}?text=${encodedMessage}`

    return NextResponse.json({
      success: true,
      data: {
        ...invoice,
        whatsappLink
      }
    })

  } catch (error: any) {
    console.error('[Invoice Detail API] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
