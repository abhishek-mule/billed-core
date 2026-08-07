import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import { verifyUpiToken } from '@/lib/billzo/crypto'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token')
    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 })
    }

    const payload = verifyUpiToken(token)
    if (!payload) {
      return NextResponse.json({ error: 'Invalid or expired payment link' }, { status: 400 })
    }

    const { invoiceId, tenantId, upiId } = payload

    const [invoiceResult, tenantResult] = await Promise.all([
      supabaseAdmin
        .from('invoices')
        .select('id, invoice_number, total, paid_amount, outstanding_amount, status, due_date, customer_name')
        .eq('id', invoiceId)
        .eq('tenant_id', tenantId)
        .maybeSingle(),
      supabaseAdmin
        .from('tenants')
        .select('name')
        .eq('id', tenantId)
        .maybeSingle()
    ])

    if (invoiceResult.error || !invoiceResult.data) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    const invoice = invoiceResult.data
    const tenant = tenantResult.data

    return NextResponse.json({
      success: true,
      invoice: {
        id: invoice.id,
        invoiceNumber: invoice.invoice_number,
        total: Number(invoice.total || 0),
        paidAmount: Number(invoice.paid_amount || 0),
        outstandingAmount: Number(invoice.outstanding_amount ?? (invoice.total - (invoice.paid_amount || 0))),
        status: invoice.status,
        dueDate: invoice.due_date,
        customerName: invoice.customer_name,
      },
      businessName: tenant?.name || 'Merchant',
      upiId,
    })
  } catch (err: any) {
    console.error('[PublicInvoice] Error:', err.message)
    return NextResponse.json({ error: 'Failed to retrieve invoice' }, { status: 500 })
  }
}
