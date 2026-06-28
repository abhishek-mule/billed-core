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

    if (!supabase) return NextResponse.json({ tenant: null })

    const { data, error } = await supabase
      .from('tenants')
      .select('name, phone, email, address, upi_id, gstin, pan, bank_details')
      .eq('id', tenantId)
      .single()

    if (error) return NextResponse.json({ tenant: null })
    return NextResponse.json({ tenant: data })
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
    }>(request, {
      fields: {
        name: { type: 'string' },
        phone: { type: 'string' },
        email: { type: 'string' },
        address: { type: 'string' },
        upiId: { type: 'string' },
        gstin: { type: 'string' },
        pan: { type: 'string' },
      },
    })
    if (body.response) return body.response
    const { name, phone, email, address, upiId, gstin, pan } = body.data!

    if (!supabase) return NextResponse.json({ error: 'Database not available' }, { status: 503 })

    const updates: Record<string, any> = {}
    if (name !== undefined) updates.name = name
    if (phone !== undefined) updates.phone = phone
    if (email !== undefined) updates.email = email
    if (address !== undefined) updates.address = address
    if (upiId !== undefined) updates.upi_id = upiId
    if (gstin !== undefined) updates.gstin = gstin
    if (pan !== undefined) updates.pan = pan

    const intentResult = await submitIntent({
      intentId: crypto.randomUUID(),
      intentType: 'tenant.update_profile',
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
      return NextResponse.json({ error: 'Authority rejected update' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
