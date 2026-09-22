import { NextRequest, NextResponse } from 'next/server'
import {
  verifyRequest,
  validateJsonBody,
  errorResponse,
  logApiAccess,
} from '@/lib/billzo/api-middleware'
import { requireFeature } from '@/lib/auth/feature-gate'
import {
  recordSettlementOffer,
  buildSettlementNoticeDraft,
  getRecoveryCasePack,
} from '@/lib/billzo/recovery-escalation'
import { validateSettlementOffer, recoveryFormatRupees } from '@billzo/shared'

export const dynamic = 'force-dynamic'

/**
 * Domain C — Settlement Workflow (Get-paid path).
 *
 * POST /api/recovery/case/:caseId/settlement/offer
 *   Body: { offer: SettlementOffer, note? }  → validated then persisted.
 *
 * POST /api/recovery/case/:caseId/settlement/notice-draft
 *   Renders the FINAL settlement notice D RAFT. Rev 2 guardrails:
 *   - language is unambiguously merchant-authored and non-threatening
 *   - BillZo never transmits, schedules, or sends this notice
 *   - the merchant reviews, edits, and sends it through their own channel
 *
 * The default settlement route never transmits anything.
 */
export async function POST(request: NextRequest, { params }: { params: { caseId: string } }) {
  try {
    const auth = await verifyRequest(request)
    if (auth.response) return auth.response
    const tid = auth.tenantId!

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

    const path = request.nextUrl.pathname

    if (path.endsWith('/notice-draft')) {
      logApiAccess(request, tid, 'system', 'recovery.settlement.notice-draft')

      const pack = await getRecoveryCasePack(tid, params.caseId)
      if (!pack?.snapshot) return errorResponse('Recovery case pack not prepared yet', 404)

      const snapshot = pack.snapshot
      const effort = snapshot.effort
      const draft = buildSettlementNoticeDraft(
        {
          merchantName: snapshot.merchantName,
          customerName: snapshot.customer?.name ?? null,
          outstanding: snapshot.outstanding,
          invoiceCount: snapshot.invoiceCount,
          maxOverdueDays: snapshot.maxOverdueDays,
          caseNumber: snapshot.caseNumber,
          effortResult: `${effort.noise} — ${effort.result}`,
          merchantNote: typeof body?.note === 'string' ? body.note : null,
        },
        { rupee: recoveryFormatRupees },
      )

      return NextResponse.json({ draft })
    }

    // POST /offer
    logApiAccess(request, tid, 'system', 'recovery.settlement.offer')

    const offer = body?.offer
    const validation = validateSettlementOffer(offer)
    if (!validation.valid) {
      return errorResponse(validation.errors.join('; '), 400)
    }

    const updated = await recordSettlementOffer(tid, params.caseId, {
      offer,
      note: typeof body?.note === 'string' ? body.note : null,
    })
    if (!updated) return errorResponse('Recovery case not found', 404)

    return NextResponse.json({
      success: true,
      escalation: updated,
      refresh: ['recovery_queue', 'command_center', 'escalation'],
    })
  } catch (err: any) {
    console.error('[Settlement] failed:', err)
    return errorResponse('Settlement workflow failed', 500)
  }
}