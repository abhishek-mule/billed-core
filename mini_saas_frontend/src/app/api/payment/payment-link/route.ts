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

    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('whatsapp_config')
      .eq('id', tenantId)
      .single()

    const config = (tenant?.whatsapp_config as Record<string, any>) || {}
    const expiry = config.paymentLinkExpiry || 7
    const expiryDate = new Date(Date.now() + expiry * 24 * 60 * 60 * 1000)

    // If Razorpay isn't configured, return a mock link for local dev
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      const mockId = `plink_${Date.now()}`
      const mockUrl = `${request.nextUrl.origin}/pay/${invoiceId}`

      await supabaseAdmin
        .from('invoices')
        .update({
          payment_link_id: mockId,
        })
        .eq('id', invoiceId)

      return NextResponse.json({
        id: mockId,
        short_url: mockUrl,
        url: mockUrl,
        amount,
        expiry: expiryDate.toISOString(),
      })
    }

    const razorpayAuth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64')

    const payload = {
      amount: Math.round(amount * 100),
      currency: 'INR',
      description: purpose || `Invoice payment for ${invoiceId}`,
      customer_name: customerName || 'Customer',
      customer_email: '',
      expiry,
      notify: { email: 0, sms: 0 },
      notes: {
        tenantId,
        invoiceId,
        source: 'billzo',
      },
    }

    const res = await fetch('https://api.razorpay.com/v1/payment_links', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${razorpayAuth}`,
      },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const err = await res.json()
      console.error('[PaymentLink] Razorpay error:', err)
      return NextResponse.json({ error: err.error?.description || 'Failed to create payment link' }, { status: 502 })
    }

    const data = await res.json()

    await supabaseAdmin
      .from('invoices')
      .update({
        payment_link_id: data.id,
      })
      .eq('id', invoiceId)

    return NextResponse.json({
      id: data.id,
      short_url: data.short_url,
      url: data.url,
      amount: data.amount / 100,
      expiry: data.expiry_at,
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

    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      return NextResponse.json({ links: [] })
    }

    const razorpayAuth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64')

    if (invoiceId) {
      const { data: invoice } = await supabaseAdmin
        .from('invoices')
        .select('payment_link_id')
        .eq('id', invoiceId)
        .eq('tenant_id', tenantId)
        .single()

      if (!invoice?.payment_link_id) {
        return NextResponse.json({ error: 'No payment link found' }, { status: 404 })
      }

      // Fetch link details from Razorpay
      const linkRes = await fetch(`https://api.razorpay.com/v1/payment_links/${invoice.payment_link_id}`, {
        headers: { Authorization: `Basic ${razorpayAuth}` },
      })

      if (!linkRes.ok) {
        return NextResponse.json({ error: 'Payment link not found' }, { status: 404 })
      }

      const link = await linkRes.json()
      return NextResponse.json({
        id: link.id,
        short_url: link.short_url,
        status: link.status,
        amount: link.amount / 100,
        expiry: link.expiry_at,
      })
    }

    // List all payment links for this tenant
    const { data: invoices } = await supabaseAdmin
      .from('invoices')
      .select('id, payment_link_id')
      .eq('tenant_id', tenantId)
      .not('payment_link_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(50)

    const linkIds = (invoices || []).filter(i => i.payment_link_id).map(i => i.payment_link_id!)

    if (linkIds.length === 0) {
      return NextResponse.json({ links: [] })
    }

    // Fetch all links from Razorpay (batched via individual fetches if needed)
    const links = await Promise.allSettled(
      linkIds.map(async (linkId) => {
        try {
          const linkRes = await fetch(`https://api.razorpay.com/v1/payment_links/${linkId}`, {
            headers: { Authorization: `Basic ${razorpayAuth}` },
          })
          if (!linkRes.ok) return null
          return await linkRes.json()
        } catch {
          return null
        }
      }),
    )

    const paymentLinks = links
      .map(r => (r.status === 'fulfilled' ? r.value : null))
      .filter(Boolean)
      .map(link => ({
        id: link.id,
        short_url: link.short_url,
        status: link.status,
        amount: link.amount / 100,
        expiry: link.expiry_at,
      }))

    return NextResponse.json({ links: paymentLinks })
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

    const { data: invoice } = await supabaseAdmin
      .from('invoices')
      .select('payment_link_id, tenant_id')
      .eq('id', invoiceId)
      .single()

    if (!invoice || invoice.tenant_id !== tenantId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    if (invoice.payment_link_id) {
      try {
        await fetch(`https://api.razorpay.com/v1/payment_links/${invoice.payment_link_id}/cancel`, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64')}`,
          },
        })
      } catch {
        console.warn('[PaymentLink] Could not cancel Razorpay link')
      }

      await supabaseAdmin
        .from('invoices')
        .update({ payment_link_id: null })
        .eq('id', invoiceId)
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[PaymentLink] DELETE error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
