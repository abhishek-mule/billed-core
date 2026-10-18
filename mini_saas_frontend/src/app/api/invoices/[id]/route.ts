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

    // invoice_items is stored with Postgres column names (item_name, quantity,
    // rate). Selecting legacy names (name/qty/price/hsn) made PostgREST fail
    // the whole select and silently return zero items everywhere.
    const { data: items, error: itemsError } = await supabaseAdmin
      .from('invoice_items')
      .select('item_name, quantity, rate, gst_rate')
      .eq('invoice_id', invoice.id)

    if (itemsError) {
      console.error('[Invoice GET] items query failed:', itemsError.message)
    }

    // Canonical read shape consumed by the invoice detail + pay pages.
    const lineItems = (items || []).map((it: any) => ({
      name: it.item_name,
      qty: Number(it.quantity ?? 0),
      price: Number(it.rate ?? 0),
      gst_rate: Number(it.gst_rate ?? 0),
    }))

    const tenantId = getVerifiedTenantIdFromRequest(request)

    if (tenantId && tenantId === invoice.tenant_id) {
      return NextResponse.json({
        ...invoice,
        items: lineItems,
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
      items: lineItems,
    })
  } catch (err: any) {
    console.error('[Invoice GET] Error:', err)
    return NextResponse.json({ error: 'Failed to load invoice' }, { status: 500 })
  }
}
