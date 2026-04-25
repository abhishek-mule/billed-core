import { NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/session'
import { orchestrateInvoiceCreation } from '@/lib/orchestration/invoice-create'

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const result = await orchestrateInvoiceCreation({
      tenantId: session.tenantId,
      payload: body,
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
