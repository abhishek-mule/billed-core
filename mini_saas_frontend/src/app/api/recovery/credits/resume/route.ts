export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import {
  verifyRequest,
  validateJsonBody,
  errorResponse,
  logApiAccess,
} from '@/lib/billzo/api-middleware'
import { resumeCreditDeferredActions } from '@/lib/billzo/recovery-credits'

/**
 * Re-arm credit-deferred actions for the authenticated tenant. Deferral is
 * NEVER auto-resumed by the system — the merchant explicitly repurchases
 * credits or hits this endpoint. Re-scheduled actions become due immediately;
 * if the tenant is still exhausted they are re-deferred at dispatch time,
 * so this is always safe to call.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyRequest(request)
    if (auth.response) return auth.response
    const tenantId = auth.tenantId!
    const userId = auth.userId!

    const bodyResult = await validateJsonBody<{ actionIds?: string[] }>(request, {
      fields: { actionIds: { type: 'array' } },
    })
    if (bodyResult.response) return bodyResult.response

    logApiAccess(request, tenantId, userId, 'recovery_credits.resume_deferred')

    const { resumed } = await resumeCreditDeferredActions(tenantId, bodyResult.data?.actionIds)

    return NextResponse.json({ ok: true, resumed })
  } catch (error: any) {
    console.error('[RecoveryCredits:resume] Error:', error)
    return errorResponse('Failed to resume deferred actions', 500)
  }
}