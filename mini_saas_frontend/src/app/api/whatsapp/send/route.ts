import { NextRequest, NextResponse } from 'next/server'
import { getVerifiedTenantIdFromRequest } from '@/lib/billzo/auth-jwt'
import { validateJsonBody } from '@/lib/billzo/api-middleware'
import { writeOutboxEvent } from '@/lib/billzo/outbox'
import { sendDirectWhatsApp } from '@/lib/billzo/whatsapp-send-direct'
import { EventType } from '@billzo/shared'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const tenantId = getVerifiedTenantIdFromRequest(request)
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await validateJsonBody<{
      customerId: string
      customerPhone?: string
      invoiceId?: string
      templateKey?: string
      vars?: Record<string, string | number>
      message?: string
      personalNote?: string
      clientCorrelationId?: string
    }>(request, {
      fields: { customerId: { required: true, type: 'string' } },
    })
    if (body.response) return body.response
    const { customerId, customerPhone, invoiceId, templateKey, vars, personalNote, message } = body.data!

    // Try immediate send
    const result = await sendDirectWhatsApp(tenantId, customerId, message || '', {
      invoiceId,
      customerPhone,
      templateKey: templateKey || null,
      vars: vars || null,
      personalNote: personalNote || null,
      origin: 'manual',
    })

    // Route by result
    if (result.sentVia === 'baileys') {
      await writeOutboxEvent({
        type: EventType.SEND_MESSAGE_INTENDED,
        tenantId,
        entityId: invoiceId || null,
        payload: {
          customerId,
          invoiceId: invoiceId || null,
          templateKey: templateKey || null,
          message: message || null,
          personalNote: personalNote || null,
          messageType: 'reminder',
          trigger: 'manual',
          override: true,
        },
      })

      return NextResponse.json({
        success: true,
        message: 'Reminder queued for delivery via WhatsApp',
      })
    }

    if (!result.success) {
      // Only write outbox for retry if there's a viable channel (Baileys or Gupshup)
      if (result.sentVia !== 'none') {
        await writeOutboxEvent({
          type: EventType.SEND_MESSAGE_INTENDED,
          tenantId,
          entityId: invoiceId || null,
          payload: {
            customerId,
            invoiceId: invoiceId || null,
            templateKey: templateKey || null,
            message: message || null,
            personalNote: personalNote || null,
            messageType: 'reminder',
            trigger: 'manual',
            override: true,
          },
        })
      }

      return NextResponse.json({
        success: false,
        error: result.error || 'Failed to send',
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: 'Reminder sent via WhatsApp!',
    })
  } catch (err: any) {
    console.error('[WhatsAppSend] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
