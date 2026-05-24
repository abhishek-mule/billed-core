import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'

export const dynamic = 'force-dynamic'

function getTenantId(request: NextRequest): string | null {
  return cookies().get('bz_tenant')?.value || null
}

function getUserId(request: NextRequest): string | null {
  const token = cookies().get('bz_access')?.value
  if (!token) return null
  try { return JSON.parse(atob(token.split('.')[1])).userId || null } catch { return null }
}

export async function POST(request: NextRequest) {
  try {
    const tenantId = getTenantId(request)
    const userId = getUserId(request)
    if (!tenantId || !userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { invoiceId, amount, customerName, customerPhone, purpose } = body

    if (!amount || amount <= 0) return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })
    if (!invoiceId) return NextResponse.json({ error: 'Invoice ID required' }, { status: 400 })

    const expiry = 7
    const expiryDate = new Date(Date.now() + expiry * 24 * 60 * 60 * 1000)

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
        Authorization: `Basic ${Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64')}`,
      },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const err = await res.json()
      console.error('[PaymentLink] Razorpay error:', err)
      return NextResponse.json({ error: err.error?.description || 'Failed to create payment link' }, { status: 502 })
    }

    const data = await res.json()

    const { error: updateError } = await supabaseAdmin
      .from('invoices')
      .update({
        payment_link_id: data.id,
        payment_link_url: data.short_url,
        payment_link_expiry: expiryDate.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', invoiceId)

    if (updateError) {
      console.error('[PaymentLink] Supabase update failed:', updateError)
    }

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
    const tenantId = getTenantId(request)
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const invoiceId = searchParams.get('invoiceId')

    if (invoiceId) {
      const { data: invoice, error } = await supabaseAdmin
        .from('invoices')
        .select('payment_link_id, payment_link_url, payment_link_expiry, tenant_id')
        .eq('id', invoiceId)
        .single()

      if (error || !invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
      if (invoice.tenant_id !== tenantId) return NextResponse.json({ error: 'Not found' }, { status: 404 })

      return NextResponse.json({
        id: invoice.payment_link_id,
        short_url: invoice.payment_link_url,
        expiry: invoice.payment_link_expiry,
      })
    }

    const { data: invoices, error } = await supabaseAdmin
      .from('invoices')
      .select('id, payment_link_id, payment_link_url, payment_link_expiry')
      .eq('tenant_id', tenantId)
      .not('payment_link_id', 'is', null)

    if (error) {
      console.error('[PaymentLink] Supabase query failed:', error)
      return NextResponse.json({ links: [] })
    }

    return NextResponse.json({
      links: (invoices || []).map(inv => ({
        invoiceId: inv.id,
        id: inv.payment_link_id,
        short_url: inv.payment_link_url,
        expiry: inv.payment_link_expiry,
        status: inv.payment_link_expiry && new Date(inv.payment_link_expiry) < new Date() ? 'expired' : 'active',
      })),
    })
  } catch (err: any) {
    console.error('[PaymentLink] GET error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const tenantId = getTenantId(request)
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const invoiceId = searchParams.get('invoiceId')

    if (!invoiceId) return NextResponse.json({ error: 'Invoice ID required' }, { status: 400 })

    const { data: invoice, error: fetchError } = await supabaseAdmin
      .from('invoices')
      .select('payment_link_id, tenant_id')
      .eq('id', invoiceId)
      .single()

    if (fetchError || !invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (invoice.tenant_id !== tenantId) return NextResponse.json({ error: 'Not found' }, { status: 404 })

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
        .update({
          payment_link_id: null,
          payment_link_url: null,
          payment_link_expiry: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', invoiceId)
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[PaymentLink] DELETE error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}