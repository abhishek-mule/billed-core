import { NextRequest, NextResponse } from 'next/server'
import { verifyRequest } from '@/lib/billzo/api-middleware'
import { requireFeature } from '@/lib/auth/feature-gate'
import { getRecoverySummary, getRecoverySummaryPreview, zeroSummary } from '@/lib/billzo/recovery-summary'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyRequest(request)
    if (auth.response) return auth.response
    const { tenantId } = auth

    const gate = await requireFeature(tenantId!, 'recovery_queue', 'GET')
    if (!gate.allowed) {
      return NextResponse.json(await getRecoverySummaryPreview(tenantId!))
    }

    return NextResponse.json(await getRecoverySummary(tenantId!))
  } catch (err: any) {
    console.error('[RecoverySummary] Error:', err)
    return NextResponse.json({ items: [], recoveredToday: 0, summary: zeroSummary })
  }
}