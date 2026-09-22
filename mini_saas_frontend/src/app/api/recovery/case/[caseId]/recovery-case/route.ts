import { NextRequest, NextResponse } from 'next/server'
import {
  verifyRequest,
  validateJsonBody,
  errorResponse,
  logApiAccess,
} from '@/lib/billzo/api-middleware'
import { requireFeature } from '@/lib/auth/feature-gate'
import {
  prepareRecoveryCase,
  getRecoveryCasePack,
  exportRecoveryCaseJSON,
} from '@/lib/billzo/recovery-escalation'

export const dynamic = 'force-dynamic'

/**
 * Domain B — Recovery Case (evidence pack + PDF/JSON export).
 *
 * GET   /api/recovery/case/:caseId/recovery-case            → active pack meta
 * POST  /api/recovery/case/:caseId/recovery-case            → prepare the pack
 * GET   /api/recovery/case/:caseId/recovery-case?export=json → deterministic JSON export
 *
 * prepare is idempotent: a second prepare for the same ACTIVE slot returns the
 * already-prepared pack (partial-unique + snapshot immutability). Re-prepare is
 * only possible after the slot is cancelled/settled. `?export=pdf` renders the
 * reusable PDF via escalation-pdf (client downloads; snapshot never rewrites).
 */
export async function GET(request: NextRequest, { params }: { params: { caseId: string } }) {
  try {
    const auth = await verifyRequest(request)
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

    logApiAccess(request, tid, 'system', 'recovery.recovery-case.get')

    const pack = await getRecoveryCasePack(tid, params.caseId)
    if (!pack?.snapshot) return errorResponse('Recovery case pack not prepared yet', 404)

    const exportParam = request.nextUrl.searchParams.get('export')
    if (exportParam === 'json') {
      return new NextResponse(exportRecoveryCaseJSON(pack), {
        headers: { 'content-type': 'application/json' },
      })
    }

    return NextResponse.json({ pack })
  } catch (err: any) {
    console.error('[RecoveryCase] get failed:', err)
    return errorResponse('Recovery case pack read failed', 500)
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
    const body = bodyResult.response ? {} : (bodyResult.data ?? {})

    const override = body?.override === true

    logApiAccess(request, tid, userId || 'system', `recovery.recovery-case.prepare${override ? ':override' : ''}`)

    const prepared = await prepareRecoveryCase(tid, params.caseId, userId ?? null, { override })

    if (!prepared) return errorResponse('Recovery case not found', 404)

    if (prepared.notRecommended) {
      return NextResponse.json({
        success: false,
        code: 'NOT_RECOMMENDED',
        error: 'This case does not meet the escalation bar; pass override:true to prepare anyway.',
      }, { status: 422 })
    }

    return NextResponse.json({
      success: true,
      prepared,
      refresh: ['recovery_queue', 'command_center', 'escalation'],
    })
  } catch (err: any) {
    console.error('[RecoveryCase] prepare failed:', err)
    return errorResponse('Recovery case prepare failed', 500)
  }
}