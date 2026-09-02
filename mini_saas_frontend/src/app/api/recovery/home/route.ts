export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { verifyRequest } from '@/lib/billzo/api-middleware'
import { getHomeDecision } from '@/lib/billzo/recovery-home'

/**
 * Home Decision API — the single authoritative "who should I act on, what,
 * why" for the Home page. Built server-side from the same RecoveryDecision
 * used across Recovery → Customer → Invoice surfaces. No business logic here.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyRequest(request)
    if (auth.response) return auth.response
    const tenantId = auth.tenantId
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const data = await getHomeDecision(tenantId)
    return NextResponse.json(data)
  } catch (err: any) {
    console.error('[RecoveryHome] failed', err)
    return NextResponse.json({ error: 'Failed to load recovery decision' }, { status: 500 })
  }
}
