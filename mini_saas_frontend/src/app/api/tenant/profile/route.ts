import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabase } from '@/lib/billzo/supabase'
import { submitIntent } from '@/lib/authority/transport'

export const dynamic = 'force-dynamic'

function getTenantId(): string | null {
  const cookieStore = cookies()
  return cookieStore.get('bz_tenant')?.value || null
}

export async function GET() {
  try {
    const tenantId = getTenantId()
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
    const tenantId = getTenantId()
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { name, phone, email, address, upiId, gstin, pan } = body

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
