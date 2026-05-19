import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { db } from '@/lib/billzo/db'

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

    const tenant = await db().tenants.get(tenantId)
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

    const expiry = tenant.whatsappConfig?.paymentLinkExpiry || 7
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

    await db().invoices.update(invoiceId, {
      paymentLinkId: data.id,
      paymentLinkUrl: data.short_url,
      paymentLinkExpiry: expiryDate.toISOString(),
    })

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
      const invoice = await db().invoices.get(invoiceId)
      if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
      if (invoice.tenantId !== tenantId) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      return NextResponse.json({
        id: invoice.paymentLinkId,
        short_url: invoice.paymentLinkUrl,
        expiry: invoice.paymentLinkExpiry,
      })
    }

    const invoices = await db().invoices
      .where('tenantId').equals(tenantId)
      .filter(inv => !!inv.paymentLinkId)
      .toArray()

    return NextResponse.json({
      links: invoices.map(inv => ({
        invoiceId: inv.id,
        id: inv.paymentLinkId,
        short_url: inv.paymentLinkUrl,
        expiry: inv.paymentLinkExpiry,
        status: inv.paymentLinkExpiry && new Date(inv.paymentLinkExpiry) < new Date() ? 'expired' : 'active',
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

    const invoice = await db().invoices.get(invoiceId)
    if (!invoice || invoice.tenantId !== tenantId) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (invoice.paymentLinkId) {
      try {
        await fetch(`https://api.razorpay.com/v1/payment_links/${invoice.paymentLinkId}/cancel`, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64')}`,
          },
        })
      } catch {
        console.warn('[PaymentLink] Could not cancel Razorpay link')
      }

      await db().invoices.update(invoiceId, {
        paymentLinkId: undefined,
        paymentLinkUrl: undefined,
        paymentLinkExpiry: undefined,
      })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[PaymentLink] DELETE error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}