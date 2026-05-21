import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getMonthlyRecoverySummary } from '@/lib/billzo/fees'

export const dynamic = 'force-dynamic'

function getTenantId(): string | null {
  return cookies().get('bz_tenant')?.value || null
}

export async function GET(request: NextRequest) {
  try {
    const tenantId = getTenantId()
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const summary = await getMonthlyRecoverySummary(tenantId)

    return NextResponse.json(summary)
  } catch (err: any) {
    console.error('[RecoveryFees] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
