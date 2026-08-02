export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { verifyRequest, errorResponse } from '@/lib/billzo/api-middleware'
import { getCaseProjection } from '@/lib/billzo/case-projection'

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyRequest(request)
    if (auth.response) return auth.response
    const { tenantId } = auth
    if (!tenantId) return errorResponse('Unauthorized', 401)

    const caseId = request.nextUrl.searchParams.get('caseId')
    if (!caseId) return errorResponse('caseId required', 400)

    const projection = await getCaseProjection(tenantId, caseId)
    return NextResponse.json(projection)
  } catch (err: any) {
    console.error('[CaseProjection] failed', err.message || err)
    if (err.message === 'Case not found') {
      return errorResponse('Case not found', 404)
    }
    return errorResponse('Failed to load case', 500)
  }
}
