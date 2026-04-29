import { NextRequest, NextResponse } from 'next/server'
import { withSessionAuth, SessionData } from '@/lib/session'
import { query } from '@/lib/db/client'

interface GSTRInvoice {
  invoice_no: string
  invoice_date: string
  invoice_value: number
  place_of_supply: string
  gst_rate: string
  taxable_value: number
  cgst_amount: number
  sgst_amount: number
  igst_amount: number
  customer_gstin?: string
  reverse_charge: string
  invoice_type: string
  ecommerce_gstin?: string
}

async function buildGSTRExport(tenantId: string, fromDate: string, toDate: string) {
  // Query invoices for the period
  const invoices = await query<Record<string, any>>(
    `SELECT 
       invoice_number, 
       created_at as invoice_date, 
       customer_gstin,
       place_of_supply,
       subtotal,
       cgst,
       sgst,
       igst,
       grand_total,
       line_items_json
     FROM invoices
     WHERE tenant_id = $1 
       AND created_at::date BETWEEN $2::date AND $3::date
       AND status = 'ACTIVE'
     ORDER BY created_at ASC`,
    [tenantId, fromDate, toDate]
  )

  // Get tenant details for GSTR header
  const tenant = await query<Record<string, any>>(
    `SELECT company_name, email, phone FROM tenants WHERE id = $1`,
    [tenantId]
  )

  if (!tenant.length) {
    throw new Error('Tenant not found')
  }

  const gstrInvoices: GSTRInvoice[] = invoices.map((inv) => {
    const cgst = Number(inv.cgst) || 0
    const sgst = Number(inv.sgst) || 0
    const igst = Number(inv.igst) || 0
    const totalGst = cgst + sgst + igst

    // Determine GST rate from total GST percentage
    let gstRate = '0'
    if (totalGst > 0) {
      const taxableValue = Number(inv.subtotal) || 1
      const gstPercent = (totalGst / taxableValue) * 100
      gstRate = gstPercent.toFixed(0)
    }

    return {
      invoice_no: inv.invoice_number,
      invoice_date: new Date(inv.invoice_date).toISOString().split('T')[0],
      invoice_value: Number(inv.grand_total),
      place_of_supply: inv.place_of_supply || 'DL',
      gst_rate: gstRate,
      taxable_value: Number(inv.subtotal),
      cgst_amount: cgst,
      sgst_amount: sgst,
      igst_amount: igst,
      customer_gstin: inv.customer_gstin,
      reverse_charge: 'N',
      invoice_type: 'REG',
      ecommerce_gstin: undefined,
    }
  })

  // Group by GST rate for GSTR summary
  const summary: Record<string, { count: number; taxable: number; gst: number }> = {}

  gstrInvoices.forEach((inv) => {
    const rate = inv.gst_rate
    if (!summary[rate]) {
      summary[rate] = { count: 0, taxable: 0, gst: 0 }
    }
    summary[rate].count += 1
    summary[rate].taxable += inv.taxable_value
    summary[rate].gst += inv.cgst_amount + inv.sgst_amount + inv.igst_amount
  })

  return {
    meta: {
      company: tenant[0].company_name,
      phone: tenant[0].phone,
      email: tenant[0].email,
      period: `${fromDate} to ${toDate}`,
      export_timestamp: new Date().toISOString(),
    },
    invoices: gstrInvoices,
    summary: summary,
  }
}

export async function POST(req: NextRequest) {
  return withSessionAuth(async (session: SessionData) => {
    try {
      const body = await req.json()
      const { from_date, to_date } = body

      if (!from_date || !to_date) {
        return NextResponse.json(
          { error: 'Missing from_date or to_date' },
          { status: 400 }
        )
      }

      const gstrData = await buildGSTRExport(session.tenantId, from_date, to_date)

      // Option: Save export record to database for audit
      try {
        await query(
          `INSERT INTO gstr_exports (tenant_id, month, year, export_data, status)
           VALUES ($1, $2, $3, $4, 'GENERATED')
           ON CONFLICT (tenant_id, month, year) DO UPDATE SET export_data = $4, status = 'GENERATED', updated_at = NOW()`,
          [
            session.tenantId,
            new Date(from_date).getMonth() + 1,
            new Date(from_date).getFullYear(),
            JSON.stringify(gstrData),
          ]
        )
      } catch (dbError) {
        // Table might not exist yet, that's OK
        console.warn('Could not save GSTR export record:', dbError)
      }

      return NextResponse.json({
        success: true,
        data: gstrData,
        message: `GSTR data exported for ${gstrData.invoices.length} invoices`,
      })
    } catch (error) {
      console.error('[GSTR Export] Error:', error)
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Export failed' },
        { status: 500 }
      )
    }
  }, req)
}
