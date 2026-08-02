export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { verifyRequest } from '@/lib/billzo/api-middleware'
import { getQueueProjection } from '@/lib/billzo/recovery-read-model'

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyRequest(request)
    if (auth.response) return auth.response
    const tenantId = auth.tenantId
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const data = await getQueueProjection(tenantId)
    return NextResponse.json(data)
  } catch (err: any) {
    console.error('[QueueProjection] failed', err)
    return NextResponse.json({ error: 'Failed to load queue' }, { status: 500 })
  }
}
