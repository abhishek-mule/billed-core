import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/session'

export const dynamic = 'force-dynamic'

console.log(`[Test Print] Received request`)

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const size = searchParams.get('size') || '58mm'

    console.log(`[Test Print] Generating ${size} test invoice`)

    const testInvoice = {
      invoice_number: 'TEST-001',
      created_at: new Date().toISOString(),
      customer_name: 'Walk-in Customer',
      customer_phone: '',
      customer_gstin: '',
      subtotal: '450.00',
      cgst: '40.50',
      sgst: '40.50',
      grand_total: '531.00',
      payment_status: 'PAID',
      payment_mode: 'UPI',
    }

    const testItems = [
      { item_name: 'Bajaj LED Bulb 9W', quantity: 2, rate: '150.00', amount: '300.00' },
      { item_name: 'Polycab Wire 2.5mm', quantity: 1, rate: '150.00', amount: '150.00' },
    ]

    if (size === '80mm') {
      return new NextResponse(generate80mmHTML(testInvoice, testItems, session), {
        headers: {
          'Content-Type': 'text/html',
          'Content-Disposition': 'inline; filename="test-invoice.html"',
        },
      })
    }

    return new NextResponse(generate58mmHTML(testInvoice, testItems, session), {
      headers: {
        'Content-Type': 'text/html',
        'Content-Disposition': 'inline; filename="test-invoice.html"',
      },
    })
  } catch (error) {
    console.error('[Test Print] Error:', error)
    return NextResponse.json({ error: 'Failed to generate test print' }, { status: 500 })
  }
}

function generate58mmHTML(invoice: any, items: any[], session: any) {
  const storeName = session.companyName || 'Test Store'
  const storeGSTIN = session.gstin || ''

  const itemRows = items.map((item: any) => {
    const name = item.item_name.length > 18 ? item.item_name.substring(0, 16) + '..' : item.item_name
    const qty = item.quantity
    const amt = Number(item.amount).toFixed(2)
    const line = `${name.padEnd(18)}`
    const qtyStr = String(qty).padStart(3)
    const amtStr = amt.padStart(7)
    return `${line}${qtyStr}₹${amtStr}`
  }).join('\n')

  const subtotal = Number(invoice.subtotal || 0).toFixed(2)
  const cgst = Number(invoice.cgst || 0).toFixed(2)
  const sgst = Number(invoice.sgst || 0).toFixed(2)
  const total = Number(invoice.grand_total || 0).toFixed(2)
  const date = new Date(invoice.created_at).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric'
  })

  const customerName = invoice.customer_name || 'Walk-in'
  const paymentStatus = invoice.payment_status || 'PENDING'

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Test Invoice</title>
<style>
* { margin: 0; padding: 0; }
body {
  font-family: 'Courier New', Courier, monospace;
  font-size: 10px;
  line-height: 1.2;
  color: #000;
  width: 58mm;
  padding: 2mm;
  margin: 0;
}
.text-center { text-align: center; }
.text-right { text-align: right; }
.bold { font-weight: bold; }
.upper { text-transform: uppercase; }
.mt-2 { margin-top: 4px; }
.mt-4 { margin-top: 8px; }
hr { border: none; border-top: 1px dashed #000; margin: 4px 0; }
@media print {
  @page { margin: 0; size: 58mm auto; }
  body { width: 58mm; }
}
</style>
</head>
<body>
<div class="text-center bold upper">${storeName}</div>
${storeGSTIN ? `<div class="text-center">GSTIN: ${storeGSTIN}</div>` : ''}
<div class="text-center mt-2">${date}</div>
<hr>
<div>INV: ${invoice.invoice_number}</div>
<div>${customerName.substring(0, 25)}</div>
<hr>
${itemRows}
<hr>
<div class="text-right">Sub: ₹${subtotal}</div>
<div class="text-right">CGST: ₹${cgst}</div>
<div class="text-right">SGST: ₹${sgst}</div>
<hr>
<div class="text-right bold">TOT: ₹${total}</div>
<hr>
<div class="text-center mt-4">${paymentStatus}</div>
<div class="text-center mt-2">THANK YOU</div>
<div class="text-center">Test Print - BillZo</div>
</body>
</html>`
}

function generate80mmHTML(invoice: any, items: any[], session: any) {
  const storeName = session.companyName || 'Test Store'
  const storeGSTIN = session.gstin || ''
  const storeAddress = session.address || ''

  const itemRows = items.map((item: any) => {
    const name = item.item_name.length > 22 ? item.item_name.substring(0, 20) + '..' : item.item_name
    const qty = item.quantity
    const amt = Number(item.amount).toFixed(2)
    const line = `${name.padEnd(22)}`
    const qtyStr = String(qty).padStart(4)
    const amtStr = amt.padStart(8)
    return `${line}${qtyStr}₹${amtStr}`
  }).join('\n')

  const subtotal = Number(invoice.subtotal || 0).toFixed(2)
  const cgst = Number(invoice.cgst || 0).toFixed(2)
  const sgst = Number(invoice.sgst || 0).toFixed(2)
  const total = Number(invoice.grand_total || 0).toFixed(2)
  const date = new Date(invoice.created_at).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  })

  const customerName = invoice.customer_name || 'Walk-in Customer'
  const customerPhone = invoice.customer_phone || ''
  const paymentStatus = invoice.payment_status || 'PENDING'
  const paymentMode = invoice.payment_mode || 'N/A'

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Test Invoice</title>
<style>
* { margin: 0; padding: 0; }
body {
  font-family: 'Courier New', Courier, monospace;
  font-size: 11px;
  line-height: 1.3;
  color: #000;
  width: 80mm;
  padding: 3mm;
  margin: 0;
}
.text-center { text-align: center; }
.text-right { text-align: right; }
.bold { font-weight: bold; }
.upper { text-transform: uppercase; }
.mt-2 { margin-top: 6px; }
.mt-4 { margin-top: 12px; }
hr { border: none; border-top: 1px dashed #000; margin: 6px 0; }
@media print {
  @page { margin: 0; size: 80mm auto; }
  body { width: 80mm; }
}
</style>
</head>
<body>
<div class="text-center bold upper" style="font-size:14px;">${storeName}</div>
${storeGSTIN ? `<div class="text-center">GSTIN: ${storeGSTIN}</div>` : ''}
${storeAddress ? `<div class="text-center">${storeAddress}</div>` : ''}
<div class="text-center mt-2">${date}</div>
<hr>
<div class="bold">INV: ${invoice.invoice_number}</div>
<div>${customerName.substring(0, 30)}</div>
${customerPhone ? `<div>Ph: ${customerPhone}</div>` : ''}
<hr>
${itemRows}
<hr>
<div class="text-right">Subtotal: ₹${subtotal}</div>
<div class="text-right">CGST: ₹${cgst}</div>
<div class="text-right">SGST: ₹${sgst}</div>
<hr>
<div class="text-right bold" style="font-size:14px;">TOTAL: ₹${total}</div>
<hr>
<div>Status: ${paymentStatus}</div>
<div>Mode: ${paymentMode}</div>
<div class="text-center mt-4 bold">THANK YOU</div>
<div class="text-center">Test Print - BillZo</div>
</body>
</html>`
}