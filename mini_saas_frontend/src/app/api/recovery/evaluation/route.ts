import { NextRequest, NextResponse } from 'next/server'
import { verifyRequest, errorResponse } from '@/lib/billzo/api-middleware'
import { getRecoveryEvaluation } from '@/lib/billzo/recovery-evaluation'

export const dynamic = 'force-dynamic'

/**
 * GET /api/recovery/evaluation
 *
 * Recovery Evaluation — read-only projection of the recovery worker's
 * persistent automation state (invoices.recovery_stage / next_recovery_at /
 * collection_actions / stop-condition evidence). Answers:
 *   "What will BillZo do automatically, when, and what happens after the
 *    customer responds?"
 *
 * This is a READ projection only. It writes nothing and invents no new
 * decision — the decision per customer is buildRecoveryDecision, the timing is
 * the worker's persisted next_recovery_at.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyRequest(request)
    if (auth.response) return auth.response
    const { tenantId } = auth
    if (!tenantId) return errorResponse('Unauthorized', 401)

    const evaluation = await getRecoveryEvaluation(tenantId)
    return NextResponse.json(evaluation)
  } catch (err: any) {
    return errorResponse(err.message, 500)
  }
}