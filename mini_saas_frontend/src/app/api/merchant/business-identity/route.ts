import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/billzo/supabase'
import { getVerifiedTenantIdFromRequest } from '@/lib/billzo/auth-jwt'
import { validateJsonBody } from '@/lib/billzo/api-middleware'
import { submitIntent } from '@/lib/authority/transport'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const tenantId = getVerifiedTenantIdFromRequest(request)
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (!supabase) return NextResponse.json({ identity: null })

    const { data, error } = await supabase
      .from('tenants')
      .select('name, phone, email, address, upi_id, gstin, pan, bank_details, logo, invoice_prefix, invoice_footer, payment_terms, whatsapp_business_number, brand_color, business_hours')
      .eq('id', tenantId)
      .single()

    if (error) return NextResponse.json({ identity: null })
    return NextResponse.json({ identity: data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const tenantId = getVerifiedTenantIdFromRequest(request)
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await validateJsonBody<{
      name?: string
      phone?: string
      email?: string
      address?: string
      upiId?: string
      gstin?: string
      pan?: string
      logo?: string
      invoicePrefix?: string
      invoiceFooter?: string
      paymentTerms?: string
      whatsappBusinessNumber?: string
      brandColor?: string
      businessHours?: Record<string, unknown>
    }>(request, {
      fields: {
        name: { type: 'string' },
        phone: { type: 'string' },
        email: { type: 'string' },
        address: { type: 'string' },
        upiId: { type: 'string' },
        gstin: { type: 'string' },
        pan: { type: 'string' },
        logo: { type: 'string' },
        invoicePrefix: { type: 'string' },
        invoiceFooter: { type: 'string' },
        paymentTerms: { type: 'string' },
        whatsappBusinessNumber: { type: 'string' },
        brandColor: { type: 'string' },
        businessHours: { type: 'object' },
      },
    })
    if (body.response) return body.response
    const { name, phone, email, address, upiId, gstin, pan, logo, invoicePrefix, invoiceFooter, paymentTerms, whatsappBusinessNumber, brandColor, businessHours } = body.data!

    if (!supabase) return NextResponse.json({ error: 'Database not available' }, { status: 503 })

    const updates: Record<string, any> = {}
    if (name !== undefined) updates.name = name
    if (phone !== undefined) updates.phone = phone
    if (email !== undefined) updates.email = email
    if (address !== undefined) updates.address = address
    if (upiId !== undefined) updates.upi_id = upiId
    if (gstin !== undefined) updates.gstin = gstin
    if (pan !== undefined) updates.pan = pan
    if (logo !== undefined) updates.logo = logo
    if (invoicePrefix !== undefined) updates.invoice_prefix = invoicePrefix
    if (invoiceFooter !== undefined) updates.invoice_footer = invoiceFooter
    if (paymentTerms !== undefined) updates.payment_terms = paymentTerms
    if (whatsappBusinessNumber !== undefined) updates.whatsapp_business_number = whatsappBusinessNumber
    if (brandColor !== undefined) updates.brand_color = brandColor
    if (businessHours !== undefined) updates.business_hours = businessHours

    const intentResult = await submitIntent({
      intentId: crypto.randomUUID(),
      intentType: 'tenant.update_business_identity',
      intentVersion: 1,
      tenantId,
      actor: `tenant:${tenantId}`,
      source: 'app',
      timestamp: new Date().toISOString(),
      causationId: null,
      correlationId: null,
      payload: updates,
      nonce: crypto.randomUUID(),
    }, 'app')

    if (!intentResult.accepted) {
      return NextResponse.json({ error: intentResult.error || 'Authority rejected update' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
