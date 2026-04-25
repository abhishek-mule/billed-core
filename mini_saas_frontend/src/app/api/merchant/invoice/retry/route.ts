import { NextResponse } from 'next/server'
import { withSessionAuth, SessionData } from '@/lib/session'
import { withCsrfProtection } from '@/lib/middleware/csrf'
import { retryInvoiceSync } from '@/lib/orchestration/invoice-sync'

async function handleRetry(request: Request, session: SessionData) {
  const { tenantId, role } = session
  if (!['owner', 'accountant'].includes(role)) {
    return NextResponse.json({ success: false, error: 'Permission denied' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const invoiceId = String(body?.invoiceId || '')
    if (!invoiceId) {
      return NextResponse.json({ success: false, error: 'invoiceId is required' }, { status: 400 })
    }

    const result = await retryInvoiceSync(tenantId, invoiceId)
    return NextResponse.json({
      success: true,
      invoiceId,
      syncStatus: result.status,
      erpInvoiceId: result.erpInvoiceId,
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Retry failed' },
      { status: 500 }
    )
  }
}

const retryHandler = await withSessionAuth(handleRetry)
export const POST = withCsrfProtection(retryHandler)
