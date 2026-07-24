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

    const tenantId = getVerifiedTenantIdFromRequest(request)

    if (tenantId && tenantId === invoice.tenant_id) {
      return NextResponse.json(invoice)
    }

    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('payment_config, name')
      .eq('id', invoice.tenant_id)
      .single()

    return NextResponse.json({
      id: invoice.id,
      invoice_number: invoice.invoice_number,
      total: invoice.grand_total || invoice.total,
      status: invoice.status,
      customer_name: invoice.customer_name,
      due_date: invoice.due_date,
      description: invoice.description || `Invoice ${invoice.invoice_number}`,
      merchant_name: tenant?.name || 'Business',
      payment_config: tenant?.payment_config || null,
    })
  } catch (err: any) {
    console.error('[Invoice GET] Error:', err)
    return NextResponse.json({ error: 'Failed to load invoice' }, { status: 500 })
  }
}
