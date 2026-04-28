import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/session'
import { queryOne, query } from '@/lib/db/client'

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
    const { searchParams } = new URL(request.url)
    const format = searchParams.get('format') || 'html'

    const invoice = await queryOne<Record<string, any>>(
      `SELECT i.*, c.customer_name, c.phone as customer_phone, c.gstin as customer_gstin, c.billing_address
       FROM invoices i
       LEFT JOIN customers c ON i.customer_id = c.id
       WHERE i.id = $1 AND i.tenant_id = $2`,
      [invoiceId, session.tenantId]
    )

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    const items = await query<Record<string, any>>(
      `SELECT item_name, quantity, rate, amount, hsn_code, gst_rate
       FROM invoice_items
       WHERE invoice_id = $1`,
      [invoiceId]
    )

    if (format === 'json') {
      return NextResponse.json({
        success: true,
        invoice,
        items,
      })
    }

    const html = generatePrintHTML(invoice, items, session)

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html',
        'Content-Disposition': `inline; filename="invoice-${invoice.invoice_number}.html"`,
      },
    })
  } catch (error) {
    console.error('[Invoice View] Error:', error)
    return NextResponse.json({ error: 'Failed to load invoice' }, { status: 500 })
  }
}

function generatePrintHTML(invoice: any, items: any[], session: any) {
  const itemRows = items.map((item, i) => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #eee;">${i + 1}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;">
        <div style="font-weight:500;">${item.item_name}</div>
        <div style="font-size:11px;color:#888;">HSN: ${item.hsn_code || '-'}</div>
      </td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:center;">${item.quantity}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">₹${item.rate}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">₹${item.amount}</td>
    </tr>
  `).join('')

  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Invoice ${invoice.invoice_number}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;color:#1a1a2e;background:#f5f5f5;padding:20px;}
.invoice{background:white;max-width:210mm;margin:0 auto;padding:30px;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.1);}
.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:30px;padding-bottom:20px;border-bottom:2px solid #4f46e5;}
.business{font-size:22px;font-weight:700;color:#4f46e5;}
.business-address{font-size:12px;color:#666;margin-top:4px;}
.invoice-info{text-align:right;}
.invoice-title{font-size:11px;color:#888;text-transform:uppercase;letter-spacing:1px;}
.invoice-number{font-size:18px;font-weight:600;margin-top:4px;}
.details{display:flex;gap:20px;margin-bottom:30px;}
.info-box{flex:1;background:#f8f9fa;padding:12px;border-radius:6px;}
.info-label{font-size:10px;color:#888;text-transform:uppercase;}
.info-value{font-size:14px;font-weight:500;margin-top:2px;}
table{width:100%;border-collapse:collapse;margin-bottom:20px;}
th{background:#4f46e5;color:white;padding:10px;font-size:11px;text-transform:uppercase;}
td{padding:8px;border-bottom:1px solid #eee;}
.totals{float:right;width:200px;}
.totals-row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #eee;}
.totals-row.total{font-size:16px;font-weight:700;border-bottom:2px solid #4f46e5;}
.clear{clear:both;}
.footer{text-align:center;padding-top:30px;border-top:1px solid #eee;color:#888;font-size:12px;}
.actions{margin-top:20px;display:flex;gap:10px;justify-content:center;}
.btn{padding:10px 20px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:500;}
.btn-print{background:#4f46e5;color:white;}
.btn-pdf{background:#1a1a2e;color:white;}
@media print{@page{margin:0;}}
</style>
</head><body>
<div class="invoice">
<div class="header">
<div>
<div class="business">${session.companyName || 'My Store'}</div>
<div class="business-address">GSTIN: ${session.gstin || 'XXABCD1234A1ZT'}</div>
</div>
<div class="invoice-info">
<div class="invoice-title">Tax Invoice</div>
<div class="invoice-number">${invoice.invoice_number}</div>
<div style="font-size:12px;color:#666;margin-top:4px;">${new Date(invoice.created_at).toLocaleDateString('en-IN')}</div>
</div>
</div>

<div class="details">
<div class="info-box">
<div class="info-label">Customer</div>
<div class="info-value">${invoice.customer_name || 'Walk-in Customer'}</div>
<div style="font-size:12px;color:#666;">${invoice.customer_phone || ''}</div>
${invoice.customer_gstin ? `<div style="font-size:11px;color:#666;">GSTIN: ${invoice.customer_gstin}</div>` : ''}
</div>
<div class="info-box">
<div class="info-label">Payment</div>
<div class="info-value">${invoice.payment_status || 'PENDING'}</div>
<div style="font-size:12px;color:#666;">${invoice.payment_mode || 'N/A'}</div>
</div>
</div>

<table><thead><tr><th>#</th><th>Item</th><th style="text-align:center">Qty</th><th style="text-align:right">Rate</th><th style="text-align:right">Amount</th></tr></thead>
<tbody>${itemRows}</tbody></table>
<div class="clear"></div>

<div class="totals">
<div class="totals-row"><span>Subtotal</span><span>₹${invoice.subtotal}</span></div>
<div class="totals-row"><span>CGST (${invoice.cgst_rate || 9}%)</span><span>₹${invoice.cgst}</span></div>
<div class="totals-row"><span>SGST (${invoice.sgst_rate || 9}%)</span><span>₹${invoice.sgst}</span></div>
<div class="totals-row total"><span>Total</span><span>₹${invoice.grand_total}</span></div>
</div>
<div class="clear"></div>

<div class="footer">
<p>Thank you for your business!</p>
<p style="font-size:10px;margin-top:4px;">Powered by BillZo</p>
</div>

<div class="actions">
<a href="javascript:window.print()" class="btn btn-print">Print Invoice</a>
</div>
</div></body></html>`
}