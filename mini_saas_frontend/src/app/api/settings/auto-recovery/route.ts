import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const tenantId = request.cookies.get('bz_tenant')?.value
  if (!tenantId) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  }

  const { data: tenant, error } = await supabaseAdmin
    .from('tenants')
    .select('auto_recovery_enabled, auto_recovery_updated_by, auto_recovery_updated_at')
    .eq('id', tenantId)
    .single()

  if (error || !tenant) {
    return NextResponse.json({ enabled: true, updatedBy: null, updatedAt: null })
  }

  return NextResponse.json({
    enabled: tenant.auto_recovery_enabled ?? true,
    updatedBy: tenant.auto_recovery_updated_by ?? null,
    updatedAt: tenant.auto_recovery_updated_at ?? null,
  })
}

export async function POST(request: NextRequest) {
  const tenantId = request.cookies.get('bz_tenant')?.value
  if (!tenantId) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const { enabled, userName } = body

  if (typeof enabled !== 'boolean') {
    return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 })
  }

  const now = new Date().toISOString()
  const { error } = await supabaseAdmin
    .from('tenants')
    .update({
      auto_recovery_enabled: enabled,
      auto_recovery_updated_by: userName || 'Merchant',
      auto_recovery_updated_at: now,
    })
    .eq('id', tenantId)

  if (error) {
    return NextResponse.json({ error: 'DATABASE_ERROR' }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    enabled,
    updatedBy: userName || 'Merchant',
    updatedAt: now,
  })
}
