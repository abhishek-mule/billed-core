import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { getWhatsAppConnectionByPhoneNumberId, updateWhatsAppConnection } from '@/lib/billzo/whatsapp-connection'
import { uuid } from '@/lib/billzo/db'
import { db } from '@/lib/billzo/db'

const WEBHOOK_SECRET = process.env.GUPSHUP_WEBHOOK_SECRET

function verifySignature(payload: string, signature: string): boolean {
  if (!WEBHOOK_SECRET) return true
  const expected = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(payload)
    .digest('hex')
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
}

async function isDuplicateEvent(phoneNumberId: string, messageId: string): Promise<boolean> {
  if (!messageId) return false
  const existing = await db().whatsappEvents
    .where('[phoneNumberId+providerMessageId]')
    .equals([phoneNumberId, messageId])
    .first()
  return !!existing
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text()
    const signature = request.headers.get('x-gupshup-signature') || request.headers.get('x-hub-signature-256')

    if (WEBHOOK_SECRET && signature && !verifySignature(rawBody, signature.replace('sha256=', ''))) {
      console.warn('[WhatsAppWebhook] Invalid signature')
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    let payload: any
    try {
      payload = JSON.parse(rawBody)
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const { event, timestamp, data } = payload

    console.log('[WhatsAppWebhook] Event:', event, 'PhoneNumberId:', data?.phone_number_id)

    const phoneNumberId = data?.phone_number_id
    if (!phoneNumberId) {
      console.warn('[WhatsAppWebhook] No phone_number_id in payload')
      return NextResponse.json({ received: true })
    }

    const connection = await (await import('@/lib/billzo/whatsapp-connection')).getWhatsAppConnectionByPhoneNumberId(phoneNumberId)
    if (!connection) {
      console.warn('[WhatsAppWebhook] No connection found for phoneNumberId:', phoneNumberId)
      return NextResponse.json({ received: true })
    }

    const tenantId = connection.tenantId
    const now = new Date().toISOString()

    switch (event) {
      case 'message':
      case 'messages': {
        const messages = Array.isArray(data.messages) ? data.messages : [data.messages]
        for (const msg of messages) {
          if (await isDuplicateEvent(phoneNumberId, msg.id)) {
            console.log('[WhatsAppWebhook] Duplicate event skipped:', msg.id)
            continue
          }
          await db().whatsappEvents.add({
            id: uuid(),
            tenantId,
            phoneNumberId,
            direction: 'inbound',
            messageType: 'customer',
            providerMessageId: msg.id,
            content: msg.text?.body || msg.body,
            messageType_: msg.type,
            status: 'received',
            occurredAt: new Date(parseInt(msg.timestamp) * 1000).toISOString(),
            createdAt: new Date().toISOString(),
            metadata: { from: msg.from, timestamp: msg.timestamp },
          })

          await handleCustomerMessage(tenantId, msg)
        }
        break
      }

      case 'smb_message_echoes': {
        const messages = Array.isArray(data.messages) ? data.messages : [data.messages]
        for (const msg of messages) {
          if (await isDuplicateEvent(phoneNumberId, msg.id)) {
            console.log('[WhatsAppWebhook] Duplicate echo event skipped:', msg.id)
            continue
          }
          await db().whatsappEvents.add({
            id: uuid(),
            tenantId,
            phoneNumberId,
            direction: 'outbound',
            messageType: 'merchant_app_reply',
            providerMessageId: msg.id,
            content: msg.text?.body || msg.body,
            messageType_: msg.type,
            status: 'sent',
            occurredAt: new Date(parseInt(msg.timestamp) * 1000).toISOString(),
            createdAt: new Date().toISOString(),
            metadata: { from: msg.from, to: msg.to, timestamp: msg.timestamp },
          })

          await handleMerchantAppReply(tenantId, msg)
        }
        break
      }

      case 'message_status':
      case 'statuses': {
        const statuses = Array.isArray(data.statuses) ? data.statuses : [data.statuses]
        for (const status of statuses) {
          if (await isDuplicateEvent(phoneNumberId, status.id)) {
            console.log('[WhatsAppWebhook] Duplicate status event skipped:', status.id)
            continue
          }
          await db().whatsappEvents.add({
            id: uuid(),
            tenantId,
            phoneNumberId,
            direction: 'outbound',
            messageType: 'status',
            providerMessageId: status.id,
            status: status.status,
            occurredAt: new Date(parseInt(status.timestamp) * 1000).toISOString(),
            createdAt: new Date().toISOString(),
            metadata: { recipient: status.recipient_id, conversation: status.conversation },
          })

          await updateMessageStatus(connection.tenantId, status)
        }
        break
      }

      case 'template_status':
      case 'template': {
        const templateId = data.id || data.template_id
        await db().whatsappEvents.add({
          id: uuid(),
          tenantId,
          phoneNumberId,
          messageType: 'template_status',
          providerMessageId: templateId,
          status: data.status,
          occurredAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          metadata: { template_name: data.name, language: data.language, reason: data.reason },
        })
        break
      }

      case 'template_category_update': {
        break
      }

      default:
        console.log('[WhatsAppWebhook] Unhandled event:', event)
    }

    return NextResponse.json({ received: true })
  } catch (error: any) {
    console.error('[WhatsAppWebhook] Error:', error)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}

async function handleCustomerMessage(tenantId: string, msg: any) {
  const customerPhone = msg.from
  if (!customerPhone) return

  const customer = await (await import('@/lib/billzo/db')).db().customers
    .where('tenantId').equals(tenantId)
    .filter(c => c.phone === customerPhone || c.whatsapp_number === customerPhone)
    .first()

  if (customer) {
    const now = new Date().toISOString()
    await (await import('@/lib/billzo/db')).db().customers.update(customer.id, {
      lastInteractionAt: new Date().toISOString(),
      lastMessageAt: new Date().toISOString(),
    })
  }
}

async function handleMerchantAppReply(tenantId: string, msg: any) {
  // Merchant manually replied from WhatsApp Business App
  // Could pause automation for this customer
}

async function updateMessageStatus(tenantId: string, status: any) {
  const providerMessageId = status.id
  if (!providerMessageId) return

  const event = await (await import('@/lib/billzo/db')).db().whatsappEvents
    .where('providerMessageId').equals(providerMessageId)
    .first()

  if (event) {
    await (await import('@/lib/billzo/db')).db().whatsappEvents.update(event.id, {
      status: status.status,
      deliveredAt: status.status === 'delivered' ? new Date().toISOString() : event.deliveredAt,
      readAt: status.status === 'read' ? new Date().toISOString() : event.readAt,
    })
  }
}