import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { db } from '@/lib/billzo/db'
import type { TenantWhatsAppConfig, WhatsAppEvent } from '@/lib/billzo/types'

function getTenantId(request: NextRequest): string | null {
  return cookies().get('bz_tenant')?.value || null
}

function interpolate(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{\{(\d+)\}\}/g, (_, n) => String(vars[n] ?? ''))
}

async function sendViaGupshup(config: TenantWhatsAppConfig, to: string, message: string) {
  const apiKey = config.gupshupApiKey
  const appName = config.gupshupAppName
  const source = config.sourceNumber

  if (!apiKey || !appName || !source) {
    throw new Error('Gupshup not configured. Please add API key in WhatsApp Settings.')
  }

  const payload = new URLSearchParams({
    api_key: apiKey,
    app_name: appName,
    channel: 'whatsapp',
    source: source,
    destination: to.replace(/\D/g, '').replace(/^91/, ''),
    message: message,
    'message[0][type]': 'text',
    'message[0][text]': message,
  })

  const res = await fetch('https://api.gupshup.io/sm/api/v1/msg', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: payload.toString(),
  })

  const data = await res.json() as any
  if (!res.ok || data.status !== 'queued') {
    throw new Error(data.error || `Gupshup error: ${res.status}`)
  }
  return data
}

export async function POST(request: NextRequest) {
  try {
    const tenantId = getTenantId(request)
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { customerId, templateKey, vars, message, personalNote, invoiceId, sendWhatsAppDirect } = body as {
      customerId?: string
      templateKey?: string
      vars?: Record<string, string | number>
      message?: string
      personalNote?: string
      invoiceId?: string
      sendWhatsAppDirect?: boolean
    }

    const tenant = await db().tenants.get(tenantId)
    const config: TenantWhatsAppConfig = tenant?.whatsappConfig || {} as TenantWhatsAppConfig

    let toNumber: string | null = null
    let customerName = 'Customer'

    if (customerId) {
      const customer = await db().customers.get(customerId)
      if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
      toNumber = (customer.whatsapp_number || customer.phone).replace(/\D/g, '')
      customerName = customer.name

      if (!customer.opt_in) {
        if (config.optInMessage) {
          const optInText = interpolate(config.optInMessage, { name: customerName })
          await sendViaGupshup(config, customer.whatsapp_number || customer.phone, optInText)
        }
        await db().customers.update(customerId, { opt_in: true, opt_in_at: new Date().toISOString() })
      }
    }

    let finalMessage = message || ''

    if (templateKey && config.templateNames?.[templateKey]) {
      const templateVars = {
        '1': vars?.['1'] || customerName,
        '2': vars?.['2'] || '',
        '3': vars?.['3'] || (tenant?.name || 'Our Shop'),
        '4': vars?.['4'] || (tenant?.name || 'Our Shop'),
        '5': vars?.['5'] || '',
      }
      finalMessage = interpolate(config.templateNames[templateKey], templateVars)
    }

    if (personalNote && personalNote.trim()) {
      finalMessage += `\n\n${personalNote.trim()}`
    }

    if (!toNumber) {
      return NextResponse.json({ error: 'Recipient not found' }, { status: 400 })
    }

    let gupshupResponse: any = null
    if (config.gupshupApiKey && config.gupshupAppName && config.sourceNumber) {
      try {
        gupshupResponse = await sendViaGupshup(config, `+${toNumber}`, finalMessage)
      } catch (sendErr: any) {
        console.error('[WhatsAppSend] Gupshup send failed:', sendErr)
        const event: WhatsAppEvent = {
          id: `wa_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          tenantId,
          invoiceId: invoiceId || undefined,
          customerId: customerId || undefined,
          phone: `+${toNumber}`,
          status: 'failed',
          messageType: templateKey || 'text',
          occurredAt: new Date().toISOString(),
          syncStatus: 'failed',
          error: sendErr.message,
        }
        await db().whatsappEvents.add(event)
        return NextResponse.json({ error: sendErr.message, event }, { status: 502 })
      }
    } else {
      console.log('[WhatsAppSend] No Gupshup config — simulating send:', { to: toNumber, message: finalMessage })
    }

    const event: WhatsAppEvent = {
      id: gupshupResponse?.messageId || `wa_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      tenantId,
      invoiceId: invoiceId || undefined,
      customerId: customerId || undefined,
      phone: `+${toNumber}`,
      status: gupshupResponse ? 'queued' : 'sent',
      messageType: templateKey || 'text',
      occurredAt: new Date().toISOString(),
      syncStatus: gupshupResponse ? 'pending' : 'synced',
    }
    await db().whatsappEvents.add(event)

    if (invoiceId) {
      const invoice = await db().invoices.get(invoiceId)
      if (invoice) {
        await db().invoices.update(invoiceId, {
          lastWhatsAppStatus: event.status,
          lastWhatsAppAt: event.occurredAt,
          syncStatus: 'pending',
        })
      }
    }

    return NextResponse.json({
      success: true,
      event,
      message: finalMessage,
      simulated: !gupshupResponse,
    })
  } catch (err: any) {
    console.error('[WhatsAppSend] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}