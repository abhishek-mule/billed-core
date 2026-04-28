import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/session'
import { queryOne, query } from '@/lib/db/client'

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

    let data: any[] = []
    let headers: string[] = []

    if (type === 'invoices') {
      const params: any[] = [session.tenantId]
      let dateFilter = ''
      
      if (startDate && endDate) {
        dateFilter = ` AND created_at BETWEEN $2 AND $3`
        params.push(startDate, endDate)
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
          'Content-Disposition': `attachment; filename="${type}-${new Date().toISOString().split('T')[0]}.csv"`,
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