import { NextRequest, NextResponse } from 'next/server'
import { getVerifiedTenantIdFromRequest, getVerifiedUserIdFromRequest } from '@/lib/billzo/auth-jwt'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import { requireFeature } from '@/lib/auth/feature-gate'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const tenantId = getVerifiedTenantIdFromRequest(request)
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const feature = request.nextUrl.searchParams.get('feature')

    if (feature) {
      const gate = await requireFeature(tenantId, feature, 'GET')
      return NextResponse.json({
        allowed: gate.allowed,
        feature,
        error: gate.allowed ? undefined : gate.error,
        upgradeTo: gate.allowed ? undefined : gate.upgradeTo,
      })
    }

    // Return full feature-access map when no specific feature is requested
    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('plan, created_at')
      .eq('id', tenantId)
      .single()

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    const plan = (tenant.plan || 'starter') as string

    return NextResponse.json({
      tenantId,
      plan,
    })
  } catch (error) {
    console.error('Feature check error:', error)
    return NextResponse.json({ error: 'Failed to check feature access' }, { status: 500 })
  }
}
