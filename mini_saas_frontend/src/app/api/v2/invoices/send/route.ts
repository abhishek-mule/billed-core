import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/session'
import { query, queryOne } from '@/lib/db/client'

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { invoiceId } = await request.json()

    if (!invoiceId) {
      return NextResponse.json({ error: 'Invoice ID required' }, { status: 400 })
    }

    const invoice = await queryOne<any>(
      'SELECT * FROM invoices WHERE id = $1 AND tenant_id = $2',
      [invoiceId, session.tenantId]
    )

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    // Trigger n8n webhook for WhatsApp
    const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL
    
    if (n8nWebhookUrl && n8nWebhookUrl.includes('http')) {
      try {
        await fetch(n8nWebhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: 'invoice_send',
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoice_number,
            customerName: invoice.customer_name,
            total: invoice.total,
            tenantId: session.tenantId,
          }),
        })
      } catch (webhookError: any) {
        console.error('[Send Invoice] Webhook failed:', webhookError.message)
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Invoice sent via WhatsApp',
      invoiceId: invoice.id,
    })

  } catch (error: any) {
    console.error('[Send Invoice] Error:', error)
    return NextResponse.json(
      { error: 'Failed to send invoice' },
      { status: 500 }
    )
  }
}