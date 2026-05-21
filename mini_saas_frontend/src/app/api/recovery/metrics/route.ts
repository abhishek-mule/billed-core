import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getTenantRecoveryMetrics } from '@/lib/billzo/attribution'

export const dynamic = 'force-dynamic'

function getTenantId(): string | null {
  return cookies().get('bz_tenant')?.value || null
}

export async function GET(request: NextRequest) {
  try {
    const tenantId = getTenantId()
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const metrics = await getTenantRecoveryMetrics(tenantId)

    return NextResponse.json(metrics)
  } catch (err: any) {
    console.error('[RecoveryMetrics] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
