import { NextRequest, NextResponse } from 'next/server'
import { verifyRequest, validateJsonBody, validateRequired, errorResponse } from '@/lib/billzo/api-middleware'

export const dynamic = 'force-dynamic'

const WORKER_URL = process.env.WORKER_URL || 'http://localhost:10000'

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyRequest(request)
    if (auth.response) return auth.response
    const { tenantId } = auth

    const bodyResult = await validateJsonBody(request)
    if (bodyResult.response) return bodyResult.response
    const body = bodyResult.data!

    const { invoiceId, reason, warningAcked } = body as {
      invoiceId: string
      reason?: string
      warningAcked?: boolean
    }

    const required = validateRequired(body, ['invoiceId'])
    if (!required.valid) return errorResponse('invoiceId is required', 400)

    const workerRes = await fetch(`${WORKER_URL}/api/v1/recovery/override`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        invoiceId,
        tenantId,
        reason: reason || 'Merchant override',
        warningAcked: warningAcked || false,
      }),
    })

    const data = await workerRes.json()

    // requiresAck is not an error — it's a prompt for merchant confirmation
    const status = (data.requiresAck || workerRes.ok) ? 200 : 400
    return NextResponse.json(data, { status })
  } catch (err: any) {
    console.error('[Override] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
