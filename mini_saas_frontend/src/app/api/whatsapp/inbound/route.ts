import { NextRequest, NextResponse } from 'next/server'
import { db, uuid } from '@/lib/billzo/db'
import { validateJsonBody } from '@/lib/billzo/api-middleware'
import { parseWhatsAppInvoice } from '@/lib/billzo/whatsapp-parser'
import { createInvoiceFromWhatsApp } from '@/lib/billzo/whatsapp-actions'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const body = await validateJsonBody<{
      phone?: string
      from?: string
      sender?: string
      message?: string
      text?: string
      content?: string
    }>(request, {
      fields: {
        phone: { type: 'string' },
        from: { type: 'string' },
        message: { type: 'string' },
      },
    })
    if (body.response) return body.response
    const raw = body.data!

    const phoneFrom = raw.phone || raw.from || raw.sender || ''
    const messageText = raw.message || raw.text || raw.content || ''

    if (!phoneFrom || !messageText) {
      return NextResponse.json({ error: 'Missing phone or message' }, { status: 400 })
    }

    const cleanPhone = phoneFrom.replace(/\D/g, '')
    const e164 = cleanPhone.startsWith('91') ? `+${cleanPhone}` : `+91${cleanPhone}`

    const tenant = await findTenantByWhatsApp(e164)
    if (!tenant) {
      return NextResponse.json({
        success: true,
        message: 'No merchant found for this number',
        simulated: true,
      })
    }

    await db().whatsappEvents.add({
      id: uuid(),
      tenantId: tenant.id,
      invoiceId: undefined,
      customerId: undefined,
      phone: e164,
      messageType: 'inbound',
      status: 'received',
      occurredAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    })

    const parsed = await parseWhatsAppInvoice(messageText, tenant.name || 'BillZo')

    if (!parsed.success || !parsed.data) {
      await sendWhatsAppReply(tenant, e164, parsed.error || 'Could not understand the message. Try: "Bill karo: Name, 2x Item price"')
      return NextResponse.json({ success: true, action: 'parse_failed', error: parsed.error })
    }

    const result = await createInvoiceFromWhatsApp(tenant.id, parsed.data, e164)

    if (!result.success) {
      await sendWhatsAppReply(tenant, e164, `Error: ${result.error}`)
      return NextResponse.json({ success: true, action: 'create_failed', error: result.error })
    }

    const reply = buildInvoiceReply(result.data!, tenant.name || 'BillZo')
    await sendWhatsAppReply(tenant, e164, reply)

    return NextResponse.json({
      success: true,
      action: 'invoice_created',
      invoiceId: result.data?.invoiceId,
      customerId: result.data?.customerId,
      total: result.data?.total,
    })
  } catch (err: any) {
    console.error('[WhatsAppInbound] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

async function findTenantByWhatsApp(phone: string) {
  const allTenants = await db().tenants.toArray()
  for (const tenant of allTenants) {
    const config = tenant.whatsappConfig as any
    if (config?.sourceNumber) {
      const cleanSource = config.sourceNumber.replace(/\D/g, '')
      const cleanPhone = phone.replace(/\D/g, '')
      if (cleanSource === cleanPhone || cleanSource === cleanPhone.replace('+', '')) {
        return tenant
      }
    }
  }
  return null
}

async function sendWhatsAppReply(tenant: any, to: string, message: string) {
  const config = tenant.whatsappConfig as any
  if (!config?.gupshupApiKey || !config?.gupshupAppName) {
    console.log('[WhatsAppInbound] Simulating reply:', { to, message })
    return
  }

  const payload = new URLSearchParams({
    api_key: config.gupshupApiKey,
    app_name: config.gupshupAppName,
    channel: 'whatsapp',
    source: config.sourceNumber || '',
    destination: to.replace(/\D/g, '').replace(/^91/, ''),
    message: message,
    'message[0][type]': 'text',
    'message[0][text]': message,
  })

  try {
    await fetch('https://api.gupshup.io/sm/api/v1/msg', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: payload.toString(),
    })
  } catch (err) {
    console.error('[WhatsAppInbound] Failed to send reply:', err)
  }
}

function buildInvoiceReply(data: { invoiceId: string; customerId: string; total: number; paymentLink?: string }, businessName: string) {
  const totalStr = `₹${data.total.toLocaleString('en-IN')}`
  let reply = `✅ Invoice created!\n`
  reply += `📋 Invoice: ${data.invoiceId.slice(0, 8).toUpperCase()}\n`
  reply += `💰 Total: ${totalStr}`

  if (data.paymentLink) {
    reply += `\n🔗 Pay: ${data.paymentLink}`
  }

  reply += `\n\n— ${businessName}`
  return reply
}
