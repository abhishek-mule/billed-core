export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { verifyRequest } from '@/lib/billzo/api-middleware'
import { getRecoveryCommandCenter } from '@/lib/billzo/recovery-command-center'

/**
 * Recovery Command Center API — the single authoritative source
 * for the Recovery page. Returns flat cards organized into three sections:
 * NEEDS YOU | BILLZO IS HANDLING | MONITORING
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyRequest(request)
    if (auth.response) return auth.response
    const tenantId = auth.tenantId
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const data = await getRecoveryCommandCenter(tenantId)
    return NextResponse.json(data)
  } catch (err: any) {
    console.error('[RecoveryCommandCenter] failed', err)
    return NextResponse.json({ error: 'Failed to load recovery command center' }, { status: 500 })
  }
}