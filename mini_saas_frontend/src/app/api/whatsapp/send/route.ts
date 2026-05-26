import { NextRequest, NextResponse } from 'next/server'
import { getVerifiedTenantIdFromRequest } from '@/lib/billzo/auth-jwt'
import { supabase } from '@/lib/billzo/supabase'
import { generateBillzoMessageId, generateEventSequence, computeTransportHash } from '@billzo/shared'
import type { TenantWhatsAppConfig } from '@/lib/billzo/types'

export const dynamic = 'force-dynamic'

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

function generateConversationId(invoiceId?: string | null, phone?: string): string {
  return invoiceId || `conv_${phone?.replace(/\D/g, '') || 'unknown'}`
}

export async function POST(request: NextRequest) {
  try {
    const tenantId = getVerifiedTenantIdFromRequest(request)
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (!supabase) {
      return NextResponse.json({ error: 'Database not available' }, { status: 503 })
    }

    const body = await request.json()
    const { customerId, templateKey, vars, message, personalNote, invoiceId, sendWhatsAppDirect, clientCorrelationId } = body as {
      customerId?: string
      templateKey?: string
      vars?: Record<string, string | number>
      message?: string
      personalNote?: string
      invoiceId?: string
      sendWhatsAppDirect?: boolean
      clientCorrelationId?: string
    }

    const { data: tenant } = await supabase
      .from('tenants')
      .select('whatsapp_config, name')
      .eq('id', tenantId)
      .single()

    const config: TenantWhatsAppConfig = tenant?.whatsapp_config || {} as TenantWhatsAppConfig

    let toNumber: string | null = null
    let customerName = 'Customer'

    if (customerId) {
      const { data: customer, error: customerError } = await supabase
        .from('customers')
        .select('*')
        .eq('id', customerId)
        .eq('tenant_id', tenantId)
        .single()

      if (customerError || !customer) {
        return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
      }
      toNumber = (customer.whatsapp_number || customer.phone).replace(/\D/g, '')
      customerName = customer.name

      if (!customer.opt_in) {
        if (config.optInMessage) {
          const optInText = interpolate(config.optInMessage, { name: customerName })
          await sendViaGupshup(config, customer.whatsapp_number || customer.phone, optInText)
        }
        await supabase
          .from('customers')
          .update({ opt_in: true, opt_in_at: new Date().toISOString() })
          .eq('id', customerId)
          .eq('tenant_id', tenantId)
      }
    }

    let finalMessage = message || ''

    if (templateKey && config.templateNames) {
      const templateName = (config.templateNames as Record<string, string | undefined>)[templateKey]
      if (templateName) {
        const templateVars = {
          '1': vars?.['1'] || customerName,
          '2': vars?.['2'] || '',
          '3': vars?.['3'] || (tenant?.name || 'Our Shop'),
          '4': vars?.['4'] || (tenant?.name || 'Our Shop'),
        }
        finalMessage = interpolate(templateName, templateVars)
      }
    }

    if (personalNote && personalNote.trim()) {
      finalMessage += `\n\n${personalNote.trim()}`
    }

    if (!toNumber) {
      return NextResponse.json({ error: 'Recipient not found' }, { status: 400 })
    }

    // Generate canonical identity — router authority via shared function
    const billzoMessageId = clientCorrelationId?.startsWith('cc_')
      ? `bmsg_${clientCorrelationId.slice(3)}_${generateBillzoMessageId().slice(5)}`
      : generateBillzoMessageId()
    const eventSequence = Number(generateEventSequence())
    const conversationId = generateConversationId(invoiceId, toNumber)
    const transportHash = computeTransportHash({
      phone: toNumber,
      message: finalMessage,
      invoiceId,
      amount: 0,
    })

    let gupshupResponse: any = null
    let sendError: string | null = null
    if (config.gupshupApiKey && config.gupshupAppName && config.sourceNumber) {
      try {
        gupshupResponse = await sendViaGupshup(config, `+${toNumber}`, finalMessage)
      } catch (sendErr: any) {
        console.error('[WhatsAppSend] Gupshup send failed:', sendErr)
        sendError = sendErr.message
      }
    } else {
      console.log('[WhatsAppSend] No Gupshup config — simulating send:', { to: toNumber, message: finalMessage })
    }

    const eventStatus = sendError ? 'failed' : gupshupResponse ? 'queued' : 'sent'

    await supabase.from('whatsapp_events').insert({
      id: crypto.randomUUID(),
      billzo_message_id: billzoMessageId,
      conversation_id: conversationId,
      event_sequence: eventSequence,
      transport_message_hash: transportHash,
      message_origin: 'manual',
      attempt_number: 1,
      tenant_id: tenantId,
      invoice_id: invoiceId || null,
      customer_id: customerId || null,
      phone: `+${toNumber}`,
      status: eventStatus,
      message_type: templateKey || 'text',
      direction: 'outbound',
      event_layer: 'transport',
      provider_message_id: gupshupResponse?.messageId || billzoMessageId,
      occurred_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      sync_status: sendError ? 'failed' : gupshupResponse ? 'pending' : 'synced',
      error: sendError,
    })

    if (invoiceId) {
      await supabase
        .from('invoices')
        .update({
          last_whatsapp_status: eventStatus,
          last_whatsapp_at: new Date().toISOString(),
          sync_status: 'pending',
        })
        .eq('id', invoiceId)
        .eq('tenant_id', tenantId)
    }

    if (sendError) {
      return NextResponse.json({ error: sendError }, { status: 502 })
    }

    return NextResponse.json({
      success: true,
      billzoMessageId,
      event: { id: billzoMessageId, status: eventStatus },
      message: finalMessage,
      simulated: !gupshupResponse,
    })
  } catch (err: any) {
    console.error('[WhatsAppSend] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
