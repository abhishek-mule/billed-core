export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { verifyRequest, validateJsonBody, errorResponse } from '@/lib/billzo/api-middleware'
import { startSession, logSessionAction, endSession, getSessions } from '@/lib/billzo/recovery-session'

/**
 * POST /api/recovery/session
 *
 * Start a new recovery session (merchant opens case)
 * Body: { caseId, customerId?, startingRecommendation? }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyRequest(request)
    if (auth.response) return auth.response
    const tenantId = auth.tenantId
    if (!tenantId) return errorResponse('Unauthorized', 401)

    const bodyResult = await validateJsonBody<{
      caseId: string
      customerId?: string
      startingRecommendation?: string
    }>(request)
    if (bodyResult.response) return bodyResult.response

    const { caseId, customerId, startingRecommendation } = bodyResult.data!
    if (!caseId) return errorResponse('caseId required', 400)

    const session = await startSession({
      tenantId,
      caseId,
      customerId,
      startingRecommendation,
      userId: auth.userId,
    })

    return NextResponse.json({ session })
  } catch (err: any) {
    console.error('[SessionAPI] POST error:', err)
    return errorResponse('Failed to start session', 500)
  }
}

/**
 * PATCH /api/recovery/session
 *
 * Log an action or end a session.
 *
 * To log an action:
 *   { sessionId, action: "call"|"reminder"|"outcome"|"note", detail? }
 *
 * To end a session:
 *   { sessionId, end: true, outcome, amountRecovered?, recommendationAccepted?,
 *     manualOverride?, notes? }
 */
export async function PATCH(request: NextRequest) {
  try {
    const auth = await verifyRequest(request)
    if (auth.response) return auth.response
    const tenantId = auth.tenantId
    if (!tenantId) return errorResponse('Unauthorized', 401)

    const bodyResult = await validateJsonBody<{
      sessionId: string
      action?: string
      detail?: string
      end?: boolean
      outcome?: string
      amountRecovered?: number
      recommendationAccepted?: boolean
      manualOverride?: string
      notes?: string
    }>(request)
    if (bodyResult.response) return bodyResult.response

    const { sessionId, action, detail, end, outcome, amountRecovered, recommendationAccepted, manualOverride, notes } = bodyResult.data!
    if (!sessionId) return errorResponse('sessionId required', 400)

    if (end) {
      if (!outcome) return errorResponse('outcome required when ending session', 400)
      await endSession({
        sessionId,
        outcome,
        amountRecovered,
        recommendationAccepted,
        manualOverride,
        notes,
        userId: auth.userId,
      })
      return NextResponse.json({ success: true, ended: true })
    }

    if (action) {
      await logSessionAction({ sessionId, action, detail })
      return NextResponse.json({ success: true })
    }

    return errorResponse('Provide action or end=true', 400)
  } catch (err: any) {
    console.error('[SessionAPI] PATCH error:', err)
    return errorResponse('Failed to update session', 500)
  }
}

/**
 * GET /api/recovery/session?caseId=xxx
 *
 * Get sessions for a case.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyRequest(request)
    if (auth.response) return auth.response
    const tenantId = auth.tenantId
    if (!tenantId) return errorResponse('Unauthorized', 401)

    const caseId = request.nextUrl.searchParams.get('caseId')
    const sessions = await getSessions({ tenantId, caseId: caseId || undefined })

    return NextResponse.json({ sessions })
  } catch (err: any) {
    console.error('[SessionAPI] GET error:', err)
    return errorResponse('Failed to load sessions', 500)
  }
}
