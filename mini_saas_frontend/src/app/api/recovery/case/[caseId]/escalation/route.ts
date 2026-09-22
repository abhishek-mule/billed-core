import { NextRequest, NextResponse } from 'next/server'
import {
  verifyRequest,
  validateJsonBody,
  errorResponse,
  logApiAccess,
} from '@/lib/billzo/api-middleware'
import { requireFeature } from '@/lib/auth/feature-gate'
import { assessRecoveryCase, recordMerchantDecision } from '@/lib/billzo/recovery-escalation'
import { MERCHANT_DECISIONS } from '@billzo/shared'

export const dynamic = 'force-dynamic'

const MERCHANT_DECISION_SET = new Set(MERCHANT_DECISIONS)

/**
 * Domain A — Recovery Decision.
 *
 * GET   /api/recovery/case/:caseId/escalation   → assessment + recommendation
 * POST  /api/recovery/case/:caseId/escalation   → decide (authorize|offer_plan|pause|decline)
 *
 * The Urgent+ rule and basis bullets are pure (packages/shared). Escalating
 * emits merchant.escalated through the SAME outbox path the Recovery Queue
 * slash commands use (queue/actions) — the worker's case machine turns it into
 * a merchant_review transition. Required before any prepare (Domain B).
 */
export async function GET(_request: NextRequest, { params }: { params: { caseId: string } }) {
  try {
    const auth = await verifyRequest(_request)
    if (auth.response) return auth.response
    const tid = auth.tenantId!

    const gate = await requireFeature(tid, 'escalation_pack', 'GET')
    if (!gate.allowed) {
      const status = gate.code === 'TENANT_NOT_FOUND' ? 404 : 403
      return NextResponse.json({
        error: gate.error,
        code: gate.code,
        message: gate.message || gate.error,
        feature: 'escalation_pack',
        upgradeTo: gate.upgradeTo || 'business',
      }, { status })
    }

    logApiAccess(_request, tid, 'system', 'recovery.escalation.assess')

    const assessment = await assessRecoveryCase(tid, params.caseId)
    if (!assessment) return errorResponse('Recovery case not found', 404)

    return NextResponse.json({ assessment })
  } catch (err: any) {
    console.error('[Escalation] assess failed:', err)
    return errorResponse('Escalation assessment failed', 500)
  }
}

export async function POST(request: NextRequest, { params }: { params: { caseId: string } }) {
  try {
    const auth = await verifyRequest(request)
    if (auth.response) return auth.response
    const tid = auth.tenantId!
    const userId = auth.userId

    const gate = await requireFeature(tid, 'escalation_pack', 'POST')
    if (!gate.allowed) {
      const status = gate.code === 'TENANT_NOT_FOUND' ? 404 : 403
      return NextResponse.json({
        error: gate.error,
        code: gate.code,
        message: gate.message || gate.error,
        feature: 'escalation_pack',
        upgradeTo: gate.upgradeTo || 'business',
      }, { status })
    }

    const bodyResult = await validateJsonBody(request)
    if (bodyResult.response) return bodyResult.response
    const body = bodyResult.data!

    const decision = body?.decision
    if (!decision || !MERCHANT_DECISION_SET.has(decision)) {
      return errorResponse(
        `decision must be one of: ${MERCHANT_DECISIONS.join(', ')}`,
        400,
      )
    }

    logApiAccess(request, tid, userId || 'system', `recovery.escalation.decide:${decision}`)

    const result = await recordMerchantDecision(tid, params.caseId, userId ?? null, {
      decision,
      note: typeof body?.note === 'string' ? body.note : null,
      emitEscalatedEvent: true,
    })

    return NextResponse.json({
      success: true,
      escalation: result.escalation,
      eventId: result.eventId ?? null,
      decision,
      refresh: ['recovery_queue', 'command_center', 'escalation'],
    })
  } catch (err: any) {
    console.error('[Escalation] decide failed:', err)
    return errorResponse('Escalation decision failed', 500)
  }
}