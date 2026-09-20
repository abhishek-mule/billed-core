import { NextRequest, NextResponse } from 'next/server'
import { verifyRequest, validateJsonBody, validateRequired, errorResponse } from '@/lib/billzo/api-middleware'
import { workerAuthHeaders } from '@/lib/billzo/worker-auth'

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

    // B-01: worker requires inter-service HMAC — fail closed without the secret.
    const workerPath = '/api/v1/recovery/override'
    const workerBody = JSON.stringify({
      invoiceId,
      tenantId,
      reason: reason || 'Merchant override',
      warningAcked: warningAcked || false,
    })
    const authHeaders = workerAuthHeaders('POST', workerPath, workerBody)
    if (!authHeaders) {
      return NextResponse.json({ error: 'Worker not configured' }, { status: 503 })
    }

    const workerRes = await fetch(`${WORKER_URL}${workerPath}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: workerBody,
    })

    const data = await workerRes.json()

    // requiresAck is not an error — it's a prompt for merchant confirmation
    const status = (data.requiresAck || workerRes.ok) ? 200 : 400
    return NextResponse.json(data, { status })
  } catch (err: any) {
    console.error('[Override] Error:', err)
    return NextResponse.json({ error: 'Failed to update recovery case' }, { status: 500 })
  }
}
