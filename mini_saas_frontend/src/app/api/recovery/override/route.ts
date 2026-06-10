import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const WORKER_URL = process.env.WORKER_URL || 'http://localhost:10000'

export async function POST(request: NextRequest) {
  try {
    const tenantId = request.cookies.get('bz_tenant')?.value
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { invoiceId, reason, warningAcked } = body as {
      invoiceId: string
      reason?: string
      warningAcked?: boolean
    }

    if (!invoiceId) {
      return NextResponse.json({ error: 'invoiceId is required' }, { status: 400 })
    }

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
