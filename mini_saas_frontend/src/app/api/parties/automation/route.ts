import { NextRequest, NextResponse } from 'next/server'
import { writeOutboxEvent } from '@/lib/billzo/outbox'
import { verifyRequest, validateJsonBody, validateRequired, errorResponse, logApiAccess } from '@/lib/billzo/api-middleware'
import type { AutomationMode } from '@/lib/billzo/types'

export const dynamic = 'force-dynamic'

const VALID_MODES: AutomationMode[] = ['full_auto', 'manual', 'muted']

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyRequest(request)
    if (auth.response) return auth.response
    const tenantId = auth.tenantId!

    const bodyResult = await validateJsonBody(request)
    if (bodyResult.response) return bodyResult.response
    const body = bodyResult.data!

    const { customerId, mode } = body as { customerId: string; mode: AutomationMode }
    const required = validateRequired(body, ['customerId', 'mode'])
    if (!required.valid) return errorResponse('customerId and mode are required', 400)

    if (!VALID_MODES.includes(mode)) {
      return errorResponse(`Invalid mode. Must be one of: ${VALID_MODES.join(', ')}`, 400)
    }

    logApiAccess(request, tenantId!, 'system', `parties.automation:${customerId}`)

    await writeOutboxEvent({
      type: 'customer.update_automation',
      tenantId,
      entityId: customerId,
      payload: { automationMode: mode },
      correlationId: `automation:${customerId}:${Date.now()}`,
      idempotencyKey: `automation:${customerId}:${mode}:${Date.now()}`,
      version: 1,
    })

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[AutomationAPI] POST error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
