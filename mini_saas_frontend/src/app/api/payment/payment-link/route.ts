import { NextRequest, NextResponse } from 'next/server'
import { getVerifiedTenantIdFromRequest, getVerifiedUserIdFromRequest } from '@/lib/billzo/auth-jwt'
import { validateJsonBody } from '@/lib/billzo/api-middleware'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const tenantId = getVerifiedTenantIdFromRequest(request)
    const userId = getVerifiedUserIdFromRequest(request)
    if (!tenantId || !userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await validateJsonBody<{
      invoiceId: string
      amount: number
      customerName?: string
      customerPhone?: string
      purpose?: string
    }>(request, {
      fields: {
        invoiceId: { required: true, type: 'string' },
        amount: { required: true, type: 'number', min: 1 },
      },
    })
    if (body.response) return body.response
    const { invoiceId, amount, customerName, customerPhone, purpose } = body.data!

    // Fetch tenant payment config
    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('upi_id, name, payment_config')
      .eq('id', tenantId)
      .single()

    const paymentConfig = tenant?.payment_config
    const upiId = paymentConfig?.upiId || tenant?.upi_id || ''
    const merchantName = tenant?.name || 'Business'

    if (paymentConfig?.method === 'upi' && !paymentConfig.upiId) {
      return NextResponse.json({ error: 'Payment not configured.', redirect: '/settings/payments' }, { status: 400 })
    }
    if (paymentConfig?.method === 'bank' && (!paymentConfig.bankAccount || !paymentConfig.bankIfsc)) {
      return NextResponse.json({ error: 'Payment not configured.', redirect: '/settings/payments' }, { status: 400 })
    }

    const linkId = `upl_${Date.now()}`
    const payPageUrl = `${request.nextUrl.origin}/pay/${invoiceId}`

    // Generate UPI deep link
    const upiLink = upiId
      ? `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(merchantName)}&am=${amount}&cu=INR&tn=${encodeURIComponent(purpose || `Invoice payment`)}`
      : ''

    await supabaseAdmin
      .from('invoices')
      .update({
        payment_link_id: linkId,
        upi_id: upiId,
      })
      .eq('id', invoiceId)

    return NextResponse.json({
      id: linkId,
      short_url: payPageUrl,
      url: payPageUrl,
      upi_link: upiLink,
      upi_id: upiId,
      merchant_name: merchantName,
      amount,
    })
  } catch (err: any) {
    console.error('[PaymentLink] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const tenantId = getVerifiedTenantIdFromRequest(request)
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const invoiceId = searchParams.get('invoiceId')

    if (invoiceId) {
      const { data: invoice } = await supabaseAdmin
        .from('invoices')
        .select('payment_link_id, upi_id')
        .eq('id', invoiceId)
        .eq('tenant_id', tenantId)
        .single()

      if (!invoice?.payment_link_id) {
        return NextResponse.json({ error: 'No payment link found' }, { status: 404 })
      }

      return NextResponse.json({
        id: invoice.payment_link_id,
        short_url: `${request.nextUrl.origin}/pay/${invoiceId}`,
        status: 'active',
        upi_id: invoice.upi_id || '',
      })
    }

    const { data: invoices } = await supabaseAdmin
      .from('invoices')
      .select('id, payment_link_id, upi_id')
      .eq('tenant_id', tenantId)
      .not('payment_link_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(50)

    return NextResponse.json({
      links: (invoices || []).map(i => ({
        id: i.payment_link_id,
        short_url: `${request.nextUrl.origin}/pay/${i.id}`,
        status: 'active',
        upi_id: i.upi_id || '',
      })),
    })
  } catch (err: any) {
    console.error('[PaymentLink] GET error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const tenantId = getVerifiedTenantIdFromRequest(request)
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const invoiceId = searchParams.get('invoiceId')
    if (!invoiceId) return NextResponse.json({ error: 'Invoice ID required' }, { status: 400 })

    await supabaseAdmin
      .from('invoices')
      .update({ payment_link_id: null })
      .eq('id', invoiceId)
      .eq('tenant_id', tenantId)

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[PaymentLink] DELETE error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
