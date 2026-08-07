import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import { getVerifiedTenantIdFromRequest } from '@/lib/billzo/auth-jwt'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params

    const { data: invoice, error } = await supabaseAdmin
      .from('invoices')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    const { data: items } = await supabaseAdmin
      .from('invoice_items')
      .select('name, qty, price, hsn, gst_rate')
      .eq('invoice_id', invoice.id)

    const tenantId = getVerifiedTenantIdFromRequest(request)

    if (tenantId && tenantId === invoice.tenant_id) {
      return NextResponse.json({
        ...invoice,
        items: items || [],
      })
    }

    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('name, phone, address, logo, upi_id, bank_details, gstin, payment_config')
      .eq('id', invoice.tenant_id)
      .single()

    return NextResponse.json({
      id: invoice.id,
      invoice_number: invoice.invoice_number,
      document_type: invoice.document_type || 'tax_invoice',
      total: invoice.grand_total || invoice.total,
      paid_amount: invoice.paid_amount || 0,
      status: invoice.status,
      customer_name: invoice.customer_name,
      due_date: invoice.due_date,
      description: invoice.description || `Invoice ${invoice.invoice_number}`,
      merchant_name: tenant?.name || 'Business',
      merchant_phone: tenant?.phone || null,
      merchant_address: tenant?.address || null,
      merchant_logo: tenant?.logo || null,
      merchant_gstin: tenant?.gstin || null,
      upi_id: tenant?.upi_id || null,
      bank_details: tenant?.bank_details || null,
      payment_config: tenant?.payment_config || null,
      items: items || [],
    })
  } catch (err: any) {
    console.error('[Invoice GET] Error:', err)
    return NextResponse.json({ error: 'Failed to load invoice' }, { status: 500 })
  }
}
