import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/session'
import { query } from '@/lib/db/client'
import * as XLSX from 'xlsx'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') || 'GSTR-1'
    const period = searchParams.get('period') || 'current-month'

    // 1. Fetch Invoices for the period
    // In a real app, parse 'period' to dates. Here we mock some filtering.
    const invoices = await query<any>(
      `SELECT i.*, c.gstin as customer_gstin 
       FROM invoices i
       LEFT JOIN customers c ON i.customer_id = c.id
       WHERE i.tenant_id = $1 
         AND i.status = 'FINALIZED'
       ORDER BY i.invoice_date DESC`,
      [session.tenantId]
    )

    // 2. Prepare Data for Excel (GSTR-1 Format)
    const b2bData = invoices
      .filter(inv => inv.customer_gstin)
      .map(inv => ({
        'GSTIN of Recipient': inv.customer_gstin,
        'Invoice Number': inv.invoice_number,
        'Invoice Date': new Date(inv.invoice_date).toLocaleDateString('en-IN'),
        'Invoice Value': Number(inv.total),
        'Place of Supply': inv.place_of_supply || 'State Code',
        'Reverse Charge': inv.reverse_charge ? 'Y' : 'N',
        'Invoice Type': 'Regular',
        'Rate': 18, // Simplified, should be per item
        'Taxable Value': Number(inv.subtotal),
        'Integrated Tax': Number(inv.igst),
        'Central Tax': Number(inv.cgst),
        'State/UT Tax': Number(inv.sgst),
        'Cess': 0
      }))

    const b2cData = invoices
      .filter(inv => !inv.customer_gstin)
      .map(inv => ({
        'Type': 'OE',
        'Place of Supply': inv.place_of_supply || 'State Code',
        'Rate': 18,
        'Taxable Value': Number(inv.subtotal),
        'Integrated Tax': Number(inv.igst),
        'Central Tax': Number(inv.cgst),
        'State/UT Tax': Number(inv.sgst),
        'Cess': 0
      }))

    // 3. Create Workbook
    const wb = XLSX.utils.book_new()
    
    const b2bSheet = XLSX.utils.json_to_sheet(b2bData)
    XLSX.utils.book_append_sheet(wb, b2bSheet, 'B2B')
    
    const b2cSheet = XLSX.utils.json_to_sheet(b2cData)
    XLSX.utils.book_append_sheet(wb, b2cSheet, 'B2CS')

    // 4. Generate Buffer
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

    // 5. Return as Download
    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Disposition': `attachment; filename="${type}_${period}.xlsx"`,
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      }
    })

  } catch (error: any) {
    console.error('[GST Export API] Error:', error)
    return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 })
  }
}
