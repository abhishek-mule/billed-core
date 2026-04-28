import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/session'
import { queryOne } from '@/lib/db/client'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const invoiceId = params.id

    const invoice = await queryOne<Record<string, any>>(
      `SELECT i.*, c.customer_name, c.phone as customer_phone, c.gstin as customer_gstin
       FROM invoices i
       LEFT JOIN customers c ON i.customer_id = c.id
       WHERE i.id = $1 AND i.tenant_id = $2`,
      [invoiceId, session.tenantId]
    )

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    const items = await queryOne<{ items: any[] }>(
      `SELECT json_agg(row_to_json(invoice_items.*)) as items
       FROM invoice_items
       WHERE invoice_id = $1`,
      [invoiceId]
    )

    const template = generateInvoiceHTML({
      invoice,
      items: items?.items || [],
      business: {
        name: session.companyName || 'My Store',
        address: '',
        phone: '',
        gstin: '',
      },
    })

    return new NextResponse(template, {
      headers: {
        'Content-Type': 'text/html',
        'Content-Disposition': `inline; filename="invoice-${invoice.invoice_number}.html"`,
      },
    })
  } catch (error) {
    console.error('[Print] Error:', error)
    return NextResponse.json({ error: 'Failed to generate print' }, { status: 500 })
  }
}

function generateInvoiceHTML({ invoice, items, business }: {
  invoice: Record<string, any>
  items: any[]
  business: { name: string; address: string; phone: string; gstin: string }
}) {
  const itemsHTML = items.map((item: any) => `
    <tr>
      <td style="padding: 8px; border-bottom: 1px solid #eee;">${item.item_name}</td>
      <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
      <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">₹${item.rate}</td>
      <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">₹${item.amount}</td>
    </tr>
  `).join('')

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Invoice ${invoice.invoice_number}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; color: #333; }
    .invoice-container { max-width: 800px; margin: 0 auto; padding: 20px; }
    .header { display: flex; justify-content: space-between; margin-bottom: 30px; }
    .business-name { font-size: 24px; font-weight: bold; color: #1a1a2e; }
    .invoice-label { font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 1px; }
    .invoice-number { font-size: 18px; font-weight: bold; color: #333; }
    .invoice-details { display: flex; justify-content: space-between; margin-bottom: 30px; }
    .info-box { background: #f8f9fa; padding: 15px; border-radius: 8px; }
    .info-label { font-size: 11px; color: #666; text-transform: uppercase; }
    .info-value { font-size: 14px; font-weight: 500; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    th { background: #1a1a2e; color: white; padding: 12px 8px; text-align: left; font-size: 12px; text-transform: uppercase; }
    .totals { display: flex; justify-content: flex-end; }
    .totals-table { width: 250px; }
    .totals-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
    .totals-row.final { font-size: 18px; font-weight: bold; border-bottom: 2px solid #1a1a2e; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; color: #666; font-size: 12px; }
    @media print {
      body { -webkit-print-color-adjust: exact; }
      .invoice-container { padding: 0; }
    }
  </style>
</head>
<body>
  <div class="invoice-container">
    <div class="header">
      <div>
        <div class="business-name">${business.name}</div>
        <div style="color: #666; margin-top: 4px;">${business.address}</div>
        <div style="color: #666;">${business.phone}</div>
      </div>
      <div style="text-align: right;">
        <div class="invoice-label">Invoice</div>
        <div class="invoice-number">${invoice.invoice_number}</div>
        <div style="color: #666; margin-top: 4px;">${new Date(invoice.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
      </div>
    </div>

    <div class="invoice-details">
      <div class="info-box">
        <div class="info-label">Bill To</div>
        <div class="info-value">${invoice.customer_name || 'Walk-in Customer'}</div>
        <div style="color: #666; margin-top: 4px;">${invoice.customer_phone || ''}</div>
        <div style="color: #666;">${invoice.customer_gstin || ''}</div>
      </div>
      <div class="info-box">
        <div class="info-label">Payment</div>
        <div class="info-value">${invoice.payment_status || 'PENDING'}</div>
        <div style="color: #666; margin-top: 4px;">${invoice.payment_mode || 'N/A'}</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Item</th>
          <th style="text-align: center;">Qty</th>
          <th style="text-align: right;">Rate</th>
          <th style="text-align: right;">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHTML}
      </tbody>
    </table>

    <div class="totals">
      <div class="totals-table">
        <div class="totals-row">
          <span>Subtotal</span>
          <span>₹${invoice.subtotal}</span>
        </div>
        <div class="totals-row">
          <span>CGST</span>
          <span>₹${invoice.cgst}</span>
        </div>
        <div class="totals-row">
          <span>SGST</span>
          <span>₹${invoice.sgst}</span>
        </div>
        <div class="totals-row final">
          <span>Total</span>
          <span>₹${invoice.grand_total}</span>
        </div>
      </div>
    </div>

    <div class="footer">
      <p>Thank you for your business!</p>
      <p>Generated by BillZo</p>
    </div>
  </div>
</body>
</html>
  `
}