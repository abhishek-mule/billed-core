import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/session'
import { queryOne, query } from '@/lib/db/client'
import * as XLSX from 'xlsx'

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

    // 1. Fetch Invoice
    const invoice = await queryOne<any>(
      `SELECT * FROM invoices WHERE id = $1 AND tenant_id = $2`,
      [id, session.tenantId]
    )

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    // 2. Fetch Line Items
    const items = await query<any>(
      `SELECT * FROM invoice_items WHERE invoice_id = $1`,
      [id]
    )

    // 3. Prepare Data for Excel
    const wb = XLSX.utils.book_new()
    
    // Header Data
    const headerData = [
      ['INVOICE', ''],
      ['Invoice Number', invoice.invoice_number],
      ['Date', new Date(invoice.invoice_date).toLocaleDateString()],
      ['Customer', invoice.customer_name],
      ['GSTIN', invoice.customer_gstin || 'N/A'],
      ['', ''],
      ['ITEM', 'QTY', 'RATE', 'TAX %', 'AMOUNT']
    ]

    const itemRows = items.map(item => [
      item.item_name,
      Number(item.quantity),
      Number(item.rate),
      Number(item.tax_rate),
      Number(item.amount)
    ])

    const footerData = [
      ['', '', '', 'Subtotal', Number(invoice.subtotal)],
      ['', '', '', 'Tax (GST)', Number(invoice.tax_amount)],
      ['', '', '', 'Grand Total', Number(invoice.total)],
    ]

    const wsData = [...headerData, ...itemRows, ...footerData]
    const ws = XLSX.utils.aoa_to_sheet(wsData)

    // Style could be added here if using a more advanced lib, 
    // but for now, we provide the raw data sheet.
    XLSX.utils.book_append_sheet(wb, ws, 'Invoice')

    // 4. Generate Buffer
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

    // 5. Return as Download
    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Disposition': `attachment; filename="Invoice_${invoice.invoice_number}.xlsx"`,
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      }
    })

  } catch (error: any) {
    console.error('[Invoice Download API] Error:', error)
    return NextResponse.json({ error: 'Failed to generate invoice download' }, { status: 500 })
  }
}
