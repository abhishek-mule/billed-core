import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/session'
import { queryOne, query } from '@/lib/db/client'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') || 'invoices'
    const format = searchParams.get('format') || 'csv'
    const startDate = searchParams.get('start_date')
    const endDate = searchParams.get('end_date')
    const invoiceId = searchParams.get('invoice_id')

    let data: any[] = []
    let headers: string[] = []
    let filename = ''

    if (type === 'invoices') {
      const params: any[] = [session.tenantId]
      let dateFilter = ''
      
      if (startDate && endDate) {
        dateFilter = ` AND created_at BETWEEN $2 AND $3`
        params.push(startDate, endDate)
      }

      if (invoiceId) {
        const invoice = await queryOne<Record<string, any>>(
          `SELECT i.*, c.customer_name, c.phone, c.gstin, c.billing_address, c.shipping_address
           FROM invoices i
           LEFT JOIN customers c ON i.customer_id = c.id
           WHERE i.tenant_id = $1 AND i.id = $2`,
          [session.tenantId, invoiceId]
        )
        
        if (invoice) {
          // Get invoice items
          const items = await query<Record<string, any>>(
            `SELECT item_code, item_name, hsn_code, quantity, rate, amount, discount, gst_rate
             FROM invoice_items
             WHERE invoice_id = $1`,
            [invoiceId]
          )
          
          return generateInvoicePDF(invoice, items)
        }
      }

      const invoices = await query<Record<string, any>>(
        `SELECT invoice_number, customer_name, customer_phone, subtotal, cgst, sgst, igst, grand_total, 
         payment_status, payment_mode, created_at
         FROM invoices 
         WHERE tenant_id = $1${dateFilter}
         ORDER BY created_at DESC
         LIMIT 100`,
        params
      )

      data = invoices
      headers = ['Invoice #', 'Customer', 'Phone', 'Subtotal', 'CGST', 'SGST', 'IGST', 'Total', 'Status', 'Mode', 'Date']
      filename = `invoices-${new Date().toISOString().split('T')[0]}`
    } 
    else if (type === 'products') {
      const products = await query<Record<string, any>>(
        `SELECT item_code, item_name, category, rate, mrp, gst_rate, stock_qty
         FROM products 
         WHERE tenant_id = $1 AND is_active = true
         ORDER BY item_name
         LIMIT 100`,
        [session.tenantId]
      )

      data = products
      headers = ['Code', 'Name', 'Category', 'Rate', 'MRP', 'GST %', 'Stock']
      filename = `products-${new Date().toISOString().split('T')[0]}`
    }
    else if (type === 'customers') {
      const customers = await query<Record<string, any>>(
        `SELECT customer_name, phone, email, gstin, billing_address
         FROM customers 
         WHERE tenant_id = $1 AND is_active = true
         ORDER BY customer_name
         LIMIT 100`,
        [session.tenantId]
      )

      data = customers
      headers = ['Name', 'Phone', 'Email', 'GSTIN', 'Address']
      filename = `customers-${new Date().toISOString().split('T')[0]}`
    }
    else if (type === 'purchase_orders') {
      const orders = await query<Record<string, any>>(
        `SELECT order_number, supplier_name, supplier_gstin, order_date, expected_date, total_amount, status, payment_status
         FROM purchase_orders
         WHERE tenant_id = $1
         ORDER BY order_date DESC
         LIMIT 100`,
        [session.tenantId]
      )

      data = orders
      headers = ['Order #', 'Supplier', 'GSTIN', 'Order Date', 'Expected Date', 'Amount', 'Status', 'Payment']
      filename = `purchase-orders-${new Date().toISOString().split('T')[0]}`
    }

    if (format === 'csv') {
      const csvRows = [headers.join(',')]
      
      for (const row of data) {
        const values = Object.values(row).map((val: any) => {
          if (val === null || val === undefined) return ''
          const str = String(val).replace(/"/g, '""')
          return str.includes(',') || str.includes('"') ? `"${str}"` : str
        })
        csvRows.push(values.join(','))
      }

      const csv = csvRows.join('\n')

      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="${filename}.csv"`,
        },
      })
    }

    if (format === 'json') {
      return NextResponse.json({
        success: true,
        data,
        headers,
        exportedAt: new Date().toISOString(),
      })
    }

    return NextResponse.json({ error: 'Invalid format' }, { status: 400 })

  } catch (error) {
    console.error('[Export] Error:', error)
    return NextResponse.json({ error: 'Export failed' }, { status: 500 })
  }
}

async function generateInvoicePDF(invoice: any, items: any[]) {
  // Simple HTML-based invoice generation
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Invoice ${invoice.invoice_number}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 20px; color: #333; }
    .container { max-width: 800px; margin: 0 auto; }
    .header { display: flex; justify-content: space-between; margin-bottom: 30px; }
    .logo { font-size: 24px; font-weight: bold; color: #4F46E5; }
    .invoice-title { font-size: 18px; font-weight: bold; margin-bottom: 5px; }
    .invoice-number { color: #666; font-size: 14px; }
    .section { margin-bottom: 20px; }
    .section-title { font-size: 14px; font-weight: bold; margin-bottom: 10px; color: #4F46E5; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    .info-item { margin-bottom: 8px; }
    .info-label { font-size: 12px; color: #666; }
    .info-value { font-size: 14px; font-weight: 500; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th { background: #F3F4F6; padding: 12px; text-align: left; font-size: 12px; font-weight: bold; color: #374151; }
    td { padding: 12px; border-bottom: 1px solid #E5E7EB; font-size: 13px; }
    .total-section { margin-top: 20px; text-align: right; }
    .total-row { display: flex; justify-content: flex-end; margin-bottom: 8px; }
    .total-label { width: 150px; color: #666; font-size: 13px; }
    .total-value { width: 120px; font-weight: bold; font-size: 14px; }
    .grand-total { font-size: 18px; color: #4F46E5; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #E5E7EB; text-align: center; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">BillZo</div>
      <div style="text-align: right;">
        <div class="invoice-title">TAX INVOICE</div>
        <div class="invoice-number">${invoice.invoice_number}</div>
        <div class="invoice-number">Date: ${new Date(invoice.created_at).toLocaleDateString()}</div>
      </div>
    </div>

    <div class="section">
      <div class="info-grid">
        <div>
          <div class="section-title">Bill From</div>
          <div class="info-item">
            <div class="info-value">Your Business Name</div>
            <div class="info-label">GSTIN: Your GSTIN</div>
          </div>
        </div>
        <div>
          <div class="section-title">Bill To</div>
          <div class="info-item">
            <div class="info-value">${invoice.customer_name || 'Customer'}</div>
            <div class="info-label">Phone: ${invoice.customer_phone || 'N/A'}</div>
            ${invoice.gstin ? `<div class="info-label">GSTIN: ${invoice.gstin}</div>` : ''}
          </div>
        </div>
      </div>
    </div>

    <div class="section">
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>HSN</th>
            <th>Qty</th>
            <th>Rate</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(item => `
            <tr>
              <td>${item.item_name}</td>
              <td>${item.hsn_code || '-'}</td>
              <td>${item.quantity}</td>
              <td>₹${item.rate.toFixed(2)}</td>
              <td>₹${item.amount.toFixed(2)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <div class="total-section">
      <div class="total-row">
        <div class="total-label">Subtotal:</div>
        <div class="total-value">₹${invoice.subtotal.toFixed(2)}</div>
      </div>
      ${invoice.cgst > 0 ? `
      <div class="total-row">
        <div class="total-label">CGST:</div>
        <div class="total-value">₹${invoice.cgst.toFixed(2)}</div>
      </div>
      ` : ''}
      ${invoice.sgst > 0 ? `
      <div class="total-row">
        <div class="total-label">SGST:</div>
        <div class="total-value">₹${invoice.sgst.toFixed(2)}</div>
      </div>
      ` : ''}
      ${invoice.igst > 0 ? `
      <div class="total-row">
        <div class="total-label">IGST:</div>
        <div class="total-value">₹${invoice.igst.toFixed(2)}</div>
      </div>
      ` : ''}
      <div class="total-row">
        <div class="total-label grand-total">Grand Total:</div>
        <div class="total-value grand-total">₹${invoice.grand_total.toFixed(2)}</div>
      </div>
    </div>

    <div class="footer">
      <div>Payment Mode: ${invoice.payment_mode || 'N/A'}</div>
      <div>Status: ${invoice.payment_status || 'Pending'}</div>
      <div style="margin-top: 10px;">Generated by BillZo - Udhar Recovery Engine for Shopkeepers</div>
    </div>
  </div>
</body>
</html>
  `

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html',
      'Content-Disposition': `attachment; filename="invoice-${invoice.invoice_number}.html"`,
    },
  })
}