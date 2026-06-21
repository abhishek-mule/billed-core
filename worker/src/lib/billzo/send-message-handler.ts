// authority:exempt event_transport — whatsapp provider pipeline
import { supabaseAdmin } from './supabase-admin'
import { writeOutboxEvent } from './outbox'
import { sendWhatsAppMessage } from '../../../lib/whatsapp-router'
import { generateStatementPdf, type StatementInvoice } from '../../../lib/statement-pdf'
import { EventType } from '@billzo/shared'
import fs from 'fs'
import path from 'path'
import os from 'os'

function interpolate(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{\{(\d+)\}\}/g, (_, n) => String(vars[n] ?? ''))
}

function formatDate(d: string): string {
  const date = new Date(d)
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
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
    .select('company_name, whatsapp_config')
    .eq('id', tenantId)
    .single()

  const config = tenant?.whatsapp_config || {} as Record<string, any>
  const toNumber = (customer.whatsapp_number || customer.phone || '').replace(/\D/g, '')
  if (!toNumber) return

  // Fetch all unpaid invoices for this customer to decide single vs consolidated
  const { data: unpaidInvoices } = await supabaseAdmin
    .from('invoices')
    .select('id, invoice_number, total, due_date')
    .eq('tenant_id', tenantId)
    .eq('customer_id', customerId)
    .neq('status', 'paid')
    .order('due_date', { ascending: true })

  const unpaid = unpaidInvoices?.filter(i => Number(i.total) > 0) || []
  const isConsolidated = unpaid.length > 1

  let invoice: any = null
  if (invoiceId) {
    const { data } = await supabaseAdmin
      .from('invoices')
      .select('total')
      .eq('id', invoiceId)
      .maybeSingle()
    invoice = data
  }

  const customerName = customer.customer_name || 'Customer'
  const merchantName = tenant?.company_name || ''

  let finalMessage = ''
  let documentUrl: string | undefined
  let documentName: string | undefined
  let messageType: string = templateKey || 'text'

  if (isConsolidated) {
    const appUrl = process.env.APP_URL || 'http://localhost:3000'
    const totalAmount = unpaid.reduce((sum, inv) => sum + Number(inv.total || 0), 0)
    const dateStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })

    // Build message with individual payment links
    const invoiceLines = unpaid.map(inv => {
      const amt = `₹ ${Number(inv.total).toLocaleString('en-IN')}`
      const payLink = `${appUrl}/pay/${inv.id}`
      return `${inv.invoice_number || inv.id} — ${amt}\nPay: ${payLink}`
    }).join('\n\n')

    finalMessage = [
      `Hi ${customerName},`,
      '',
      `You have ₹ ${totalAmount.toLocaleString('en-IN')} pending across ${unpaid.length} invoices.`,
      '',
      'Statement attached. You can pay each invoice individually:',
      '',
      invoiceLines,
      '',
      `Regards,\n${merchantName || 'BillZo'}`,
    ].filter(Boolean).join('\n')

    // Generate statement PDF with payment links
    const statementInvoices: StatementInvoice[] = unpaid.map(inv => ({
      invoiceNumber: inv.invoice_number || inv.id,
      date: formatDate(inv.due_date),
      total: Number(inv.total || 0),
      payLink: `${appUrl}/pay/${inv.id}`,
    }))
    const pdfBuffer = generateStatementPdf({
      merchantName,
      customerName,
      invoices: statementInvoices,
      totalOutstanding: totalAmount,
      date: dateStr,
    })

    // Write to temp file
    const tmpDir = path.join(os.tmpdir(), 'billzo-statements')
    fs.mkdirSync(tmpDir, { recursive: true })
    const pdfPath = path.join(tmpDir, `${tenantId}_${customerId}.pdf`)
    fs.writeFileSync(pdfPath, pdfBuffer)

    documentUrl = pdfPath
    documentName = `Statement_${customerName.replace(/\s+/g, '_')}.pdf`
    messageType = 'statement'
  } else if (templateKey && config.templateNames) {
    const templateName = (config.templateNames as Record<string, string | undefined>)[templateKey]
    if (templateName) {
      const templateVars = {
        '1': vars?.['1'] || customerName,
        '2': vars?.['2'] || '',
        '3': vars?.['3'] || merchantName,
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
    ...(documentUrl ? {
      type: 'document' as const,
      documentUrl,
      documentName,
    } : {}),
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
    message_type: messageType,
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

  // Throw on failure so the outbox event is retried by markEventFailed
  if (sendResult.error) {
    throw new Error(`WhatsApp send failed via ${sendResult.provider}: ${sendResult.error}`)
  }
}
