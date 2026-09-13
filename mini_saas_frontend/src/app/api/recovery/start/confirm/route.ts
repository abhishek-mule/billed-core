import { NextRequest, NextResponse } from 'next/server'
import { verifyRequest, errorResponse } from '@/lib/billzo/api-middleware'
import { confirmStartRecovery } from '@/lib/billzo/recovery-start'

export const dynamic = 'force-dynamic'

/**
 * POST /api/recovery/start/confirm
 *
 * Merchant-initiated Start Recovery. Re-derives eligibility from the decision
 * engine (never trusts a browser-supplied invoice list) and creates pending
 * collection_actions (source='merchant') for every eligible customer.
 *
 * These are QUEUED attempts — they are not yet sent. "N reminders queued".
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyRequest(request)
    if (auth.response) return auth.response
    const { tenantId } = auth
    if (!tenantId) return errorResponse('Unauthorized', 401)

    const result = await confirmStartRecovery(tenantId)
    return NextResponse.json({
      success: true,
      ...result,
      message: `${result.queued} reminder${result.queued === 1 ? '' : 's'} queued`,
    })
  } catch (err: any) {
    return errorResponse(err?.message || 'Failed to start recovery', 500)
  }
}