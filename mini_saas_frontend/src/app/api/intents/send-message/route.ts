import { NextRequest, NextResponse } from 'next/server'
import { getVerifiedTenantIdFromRequest } from '@/lib/billzo/auth-jwt'
import { validateJsonBody } from '@/lib/billzo/api-middleware'
import { writeOutboxEvent } from '@/lib/billzo/outbox'
import { EventType } from '@billzo/shared'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const tenantId = getVerifiedTenantIdFromRequest(request)
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await validateJsonBody<{
      customerId?: string
      invoiceId?: string
      templateKey?: string
      vars?: Record<string, string | number>
      personalNote?: string
      clientCorrelationId?: string
    }>(request, {
      fields: { customerId: { required: true, type: 'string' } },
    })
    if (body.response) return body.response
    const { customerId, invoiceId, templateKey, vars, personalNote, clientCorrelationId } = body.data!

    const eventId = await writeOutboxEvent({
      type: EventType.SEND_MESSAGE_INTENDED,
      tenantId,
      entityId: invoiceId || null,
      payload: {
        customerId,
        invoiceId: invoiceId || null,
        templateKey: templateKey || null,
        vars: vars || null,
        personalNote: personalNote || null,
        clientCorrelationId: clientCorrelationId || null,
      },
      idempotencyKey: clientCorrelationId || null,
    })

    return NextResponse.json({ success: true, eventId })
  } catch (err: any) {
    console.error('[Intents/SendMessage] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
