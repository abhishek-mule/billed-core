import { NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/session'
import { orchestrateInvoiceCreation } from '@/lib/orchestration/invoice-create'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Enforce idempotency key
  const idempotencyKey = request.headers.get('x-idempotency-key')
  if (!idempotencyKey || idempotencyKey.trim().length === 0) {
    return NextResponse.json(
      {
        success: false,
        error: 'Idempotency key required',
        hint: 'Send x-idempotency-key header with a unique key (e.g., inv_timestamp_uuid)',
      },
      { status: 400 }
    )
  }

  if (!idempotencyKey.startsWith('inv_') || idempotencyKey.length < 20) {
    return NextResponse.json(
      {
        success: false,
        error: 'Invalid idempotency key format',
        hint: 'Key should be: inv_timestamp_uuid',
      },
      { status: 400 }
    )
  }

  try {
    const body = await request.json()
    const result = await orchestrateInvoiceCreation({
      tenantId: session.tenantId,
      payload: body,
      idempotencyKey,
    })

    return NextResponse.json({
      success: true,
      ...result
    })
  } catch (error) {
    console.error('[API_CREATE_INVOICE_ERROR]', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create invoice'
    }, { status: 500 })
  }
}
