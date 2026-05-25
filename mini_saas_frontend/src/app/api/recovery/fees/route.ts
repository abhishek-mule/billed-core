import { NextRequest, NextResponse } from 'next/server'
import { getVerifiedTenantIdFromRequest } from '@/lib/billzo/auth-jwt'
import { getMonthlyRecoverySummary } from '@/lib/billzo/fees'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const tenantId = getVerifiedTenantIdFromRequest(request)
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const summary = await getMonthlyRecoverySummary(tenantId)

    return NextResponse.json(summary)
  } catch (err: any) {
    console.error('[RecoveryFees] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
