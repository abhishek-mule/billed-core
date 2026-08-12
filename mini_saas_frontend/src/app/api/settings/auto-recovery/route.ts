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

  // Enforcement side-effects:
  //  - OFF → cancel all pending automatic (source='system') actions so nothing
  //    already-scheduled can escape the new OFF state.
  //  - ON  → best-effort re-plan open invoices so recovery resumes.
  let cancelled = 0
  let replanned = 0
  if (!enabled) {
    const { cancelAutomaticActionsForTenant } = await import('@/lib/recovery/enforcement')
    cancelled = await cancelAutomaticActionsForTenant(tenantId, 'auto_recovery_disabled')
  } else {
    const { backfillUnplanned } = await import('@/lib/recovery/planner')
    try {
      replanned = await backfillUnplanned(tenantId, 200)
    } catch (err) {
      console.error('[AutoRecovery] Re-plan on enable failed (non-fatal):', err)
    }
  }

  return NextResponse.json({
    success: true,
    enabled,
    updatedBy: userName || 'Merchant',
    updatedAt: now,
    cancelled,
    replanned,
  })
}
