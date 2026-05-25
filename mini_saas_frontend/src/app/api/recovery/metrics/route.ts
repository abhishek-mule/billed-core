import { NextRequest, NextResponse } from 'next/server'
import { getVerifiedTenantIdFromRequest } from '@/lib/billzo/auth-jwt'
import { getTenantRecoveryMetrics } from '@/lib/billzo/attribution'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const tenantId = getVerifiedTenantIdFromRequest(request)
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const metrics = await getTenantRecoveryMetrics(tenantId)

    return NextResponse.json(metrics)
  } catch (err: any) {
    console.error('[RecoveryMetrics] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
