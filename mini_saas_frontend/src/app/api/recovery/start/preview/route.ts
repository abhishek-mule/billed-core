import { NextRequest, NextResponse } from 'next/server'
import { verifyRequest, errorResponse } from '@/lib/billzo/api-middleware'
import { getStartRecoveryPreview } from '@/lib/billzo/recovery-start'

export const dynamic = 'force-dynamic'

/**
 * POST /api/recovery/start/preview
 *
 * Read-only preview of what Start Recovery would do, derived from the
 * decision engine (buildRecoveryDecision) + the tenant's policy projection.
 * Writes nothing and invents no new decision.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyRequest(request)
    if (auth.response) return auth.response
    const { tenantId } = auth
    if (!tenantId) return errorResponse('Unauthorized', 401)

    const preview = await getStartRecoveryPreview(tenantId)
    return NextResponse.json(preview)
  } catch (err: any) {
    return errorResponse(err?.message || 'Failed to build preview', 500)
  }
}