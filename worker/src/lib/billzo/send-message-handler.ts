// authority:exempt event_transport — whatsapp provider pipeline
import { supabaseAdmin } from './supabase-admin'
import { writeOutboxEvent } from './outbox'
import { sendWhatsAppMessage } from '../../../lib/whatsapp-router'
import { EventType } from '@billzo/shared'

function interpolate(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{\{(\d+)\}\}/g, (_, n) => String(vars[n] ?? ''))
}

export async function tryHandleSendMessageIntent(event: any): Promise<void> {
  if (event.type !== EventType.SEND_MESSAGE_INTENDED) return

  const tenantId = event.tenantId
  const invoiceId = event.entityId
  const payload = event.payload || {}
  const { customerId, templateKey, vars, personalNote } = payload

  if (!tenantId || !customerId) return

  const { data: customer } = await supabaseAdmin
    .from('customers')
    .select('*')
    .eq('id', customerId)
    .single()

  if (!customer) return

  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('name, whatsapp_config')
    .eq('id', tenantId)
    .single()

  const config = tenant?.whatsapp_config || {} as Record<string, any>
  const toNumber = (customer.whatsapp_number || customer.phone || '').replace(/\D/g, '')
  if (!toNumber) return

  let invoice: any = null
  if (invoiceId) {
    const { data } = await supabaseAdmin
      .from('invoices')
      .select('total, payment_link_url')
      .eq('id', invoiceId)
      .single()
    invoice = data
  }

  const customerName = customer.name || 'Customer'

  let finalMessage = ''

  if (templateKey && config.templateNames) {
    const templateName = (config.templateNames as Record<string, string | undefined>)[templateKey]
    if (templateName) {
      const templateVars = {
        '1': vars?.['1'] || customerName,
        '2': vars?.['2'] || '',
        '3': vars?.['3'] || (tenant?.name || ''),
        '4': vars?.['4'] || '',
      }
      finalMessage = interpolate(templateName, templateVars)
    }
  }

  if (!finalMessage && payload.message) {
    finalMessage = payload.message
  }

  if (!finalMessage) return

  if (personalNote?.trim()) {
    finalMessage += `\n\n${personalNote.trim()}`
  }

  const sendResult = await sendWhatsAppMessage(tenantId, `+${toNumber}`, finalMessage, {
    invoiceId: invoiceId || null,
    customerId,
    messageOrigin: 'manual',
    conversationId: invoiceId || `conv_${toNumber}`,
  })

  const eventStatus = sendResult.error ? 'failed' : 'queued'
  const messageId = sendResult.identity?.billzoMessageId || sendResult.messageId

  await supabaseAdmin.from('whatsapp_events').insert({
    id: messageId,
    billzo_message_id: messageId,
    conversation_id: sendResult.identity?.conversationId || '',
    event_sequence: Number(sendResult.identity?.eventSequence || Date.now()),
    transport_message_hash: sendResult.identity?.transportMessageHash || '',
    message_origin: 'manual',
    attempt_number: sendResult.identity?.attemptNumber || 1,
    tenant_id: tenantId,
    invoice_id: invoiceId || null,
    customer_id: customerId,
    phone: `+${toNumber}`,
    status: eventStatus,
    message_type: templateKey || 'text',
    direction: 'outbound',
    event_layer: 'transport',
    provider_message_id: sendResult.messageId || messageId,
    occurred_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    sync_status: sendResult.error ? 'failed' : 'pending',
    error: sendResult.error || null,
    provider: sendResult.provider,
  })

  if (!sendResult.error) {
    await writeOutboxEvent({
      type: EventType.WHATSAPP_STATUS_UPDATED,
      tenantId,
      entityId: invoiceId || null,
      payload: {
        billzoMessageId: messageId,
        status: eventStatus,
        provider: sendResult.provider,
        providerMessageId: sendResult.messageId,
        timestamp: new Date().toISOString(),
      },
      causationId: event.id,
      correlationId: event.correlationId || '',
      idempotencyKey: `send:intended:${messageId}:initial`,
    })
  }

  await writeOutboxEvent({
    type: EventType.SEND_MESSAGE_EXECUTED,
    tenantId,
    entityId: invoiceId || null,
    payload: {
      customerId,
      billzoMessageId: messageId,
      provider: sendResult.provider,
      status: eventStatus,
      error: sendResult.error || null,
    },
    causationId: event.id,
    correlationId: event.correlationId || '',
    idempotencyKey: `send:executed:${messageId}`,
  })
}
