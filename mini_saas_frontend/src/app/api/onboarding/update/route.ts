import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/session'

const VALID_CHECKLIST_IDS = new Set([
  'shopName',
  'firstInvoice',
  'firstWhatsApp',
  'addCustomer',
])

export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const checklistId = String(body?.checklistId || '')
    const tenantId = String(body?.tenantId || '')

    if (!VALID_CHECKLIST_IDS.has(checklistId)) {
      return NextResponse.json({ success: false, error: 'Invalid checklist item' }, { status: 400 })
    }

    if (tenantId && tenantId !== session.tenantId) {
      return NextResponse.json({ success: false, error: 'Tenant mismatch' }, { status: 403 })
    }

    return NextResponse.json({
      success: true,
      tenantId: session.tenantId,
      checklistId,
      completedAt: new Date().toISOString(),
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to update checklist' },
      { status: 500 }
    )
  }
}
