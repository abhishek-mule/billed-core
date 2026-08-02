export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { verifyRequest } from '@/lib/billzo/api-middleware'
import { getDashboardProjection } from '@/lib/billzo/recovery-read-model'

/**
 * Thin API wrapper around RecoveryReadModel.
 *
 * No business logic — only auth + projection. All recovery logic lives
 * in lib/billzo/recovery-read-model.ts, which is the single source
 * of truth for every recovery surface (Dashboard, Queue, Case, Reports).
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyRequest(request)
    if (auth.response) return auth.response
    const tenantId = auth.tenantId
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const data = await getDashboardProjection(tenantId)
    return NextResponse.json(data)
  } catch (err: any) {
    console.error('[RecoveryWorkspace] failed', err)
    return NextResponse.json({ error: 'Failed to load recovery data' }, { status: 500 })
  }
}
