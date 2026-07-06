import { supabaseAdmin } from './supabase-admin'
import { randomUUID } from 'crypto'
import { createRedisClient } from './redis'

function interpolate(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{\{(\d+)\}\}/g, (_, n) => String(vars[n] ?? ''))
}

export type SendResult =
  | { success: true; sentVia: 'gupshup'; messageId: string }
  | { success: false; sentVia: 'baileys' | 'gupshup' | 'none'; messageId?: string; error: string }

export async function sendDirectWhatsApp(
  tenantId: string,
  customerId: string,
  message: string,
  options?: {
    invoiceId?: string | null
    customerPhone?: string
    templateKey?: string | null
    vars?: Record<string, string | number> | null
    personalNote?: string | null
    origin?: string
  },
): Promise<SendResult> {
  // 1. Resolve phone + customer name
  let phone = options?.customerPhone || ''
  let customerName = 'Customer'
  if (!phone) {
    const { data: customer } = await supabaseAdmin
      .from('customers')
      .select('phone, customer_name')
      .eq('id', customerId)
      .single()
    if (!customer) return { success: false, sentVia: 'none', error: 'Customer not found' }
    phone = customer.phone || ''
    customerName = customer.customer_name || 'Customer'
  }

  const cleanPhone = phone.replace(/\D/g, '')
  if (!cleanPhone) return { success: false, sentVia: 'none', error: 'Customer has no phone number' }

  // 2. Resolve provider: check messaging_channels first, fall back to tenants.whatsapp_config
  let provider: string | null = null
  let channelConfig: Record<string, any> | null = null

  const { data: channel } = await supabaseAdmin
    .from('messaging_channels')
    .select('id, provider, config')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('priority', { ascending: true })
    .limit(1)
    .single()

  if (channel) {
    provider = channel.provider
    channelConfig = (channel?.config || {}) as Record<string, any> | null
  } else {
    // Fallback: check tenants.whatsapp_config (settings page saves here)
    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('whatsapp_config')
      .eq('id', tenantId)
      .single()

    const cfg = tenant?.whatsapp_config as Record<string, any> | null
    if (cfg?.whatsappProvider === 'baileys' || cfg?.whatsappProvider === 'gupshup') {
      provider = cfg.whatsappProvider
      channelConfig = cfg
    }
  }

  if (!provider) {
    // Last resort: check Redis for existing Baileys auth (paired in a previous session)
    try {
      const redis = createRedisClient()
      const authExists = await redis.exists(`baileys:creds:${tenantId}`)
      if (authExists) {
        provider = 'baileys'
      }
    } catch {
      // Redis not available — skip
    }
  }

  if (!provider) {
    return { success: false, sentVia: 'none', error: 'No active messaging channel configured. Go to Settings > WhatsApp to set up.' }
  }

  // 3. Route by provider
  if (provider === 'baileys') {
    // Worker handles send via Baileys; caller writes outbox events
    return { success: false, sentVia: 'baileys', error: 'Baileys requires worker' }
  }

  if (provider !== 'gupshup') {
    return { success: false, sentVia: 'none', error: `Unsupported provider: ${provider}` }
  }

  // 4. Resolve final message (template or raw text)
  let finalMessage = message
  if (!finalMessage) {
    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('company_name, whatsapp_config')
      .eq('id', tenantId)
      .single()

    const config = tenant?.whatsapp_config as Record<string, any> | null
    const businessName = tenant?.company_name || 'BillZo'

    if (options?.templateKey && config?.templateNames) {
      const templateName = (config.templateNames as Record<string, string | undefined>)[options.templateKey]
      if (templateName) {
        const vars = {
          '1': options?.vars?.['1'] || customerName,
          '2': options?.vars?.['2'] || '',
          '3': options?.vars?.['3'] || businessName,
          '4': options?.vars?.['4'] || '',
        }
        finalMessage = interpolate(templateName, vars)
      }
    }

    if (!finalMessage) finalMessage = `Hello ${customerName}, this is a reminder from ${businessName}.`
  }

  if (options?.personalNote?.trim()) {
    finalMessage += `\n\n${options.personalNote.trim()}`
  }

  // 5. Send via Gupshup REST API
  const gKey = channelConfig?.gupshupApiKey
  const gApp = channelConfig?.gupshupAppName
  const gSrc = channelConfig?.sourceNumber

  if (!gKey || !gApp || !gSrc) {
    return { success: false, sentVia: 'gupshup', error: 'Gupshup channel missing API key, app name, or source number' }
  }

  const cleanDest = cleanPhone.replace(/^91/, '')
  const body = new URLSearchParams({
    api_key: gKey,
    app_name: gApp,
    channel: 'whatsapp',
    source: gSrc,
    destination: cleanDest,
    message: finalMessage,
    'message[0][type]': 'text',
    'message[0][text]': finalMessage,
  })

  let sendOk = false
  let providerMsgId: string | undefined
  const sentVia: 'gupshup' = 'gupshup'

  try {
    const res = await fetch('https://api.gupshup.io/sm/api/v1/msg', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })
    const data = (await res.json().catch(() => ({}))) as Record<string, any>
    sendOk = res.ok && (data.status === 'queued' || data.status === 'sent' || !data.error)
    providerMsgId = data.messageId || data.id || undefined
  } catch (err: any) {
    console.error('[sendDirectWhatsApp] Gupshup API error:', err)
  }

  // 6. Record in whatsapp_events
  const messageId = options?.invoiceId
    ? `manual_${options.invoiceId.slice(0, 12)}`
    : `manual_${randomUUID().slice(0, 12)}`

  try {
    await supabaseAdmin.from('whatsapp_events').insert({
      id: messageId,
      billzo_message_id: messageId,
      tenant_id: tenantId,
      invoice_id: options?.invoiceId || null,
      customer_id: customerId,
      phone: `+${cleanPhone}`,
      status: sendOk ? 'sent' : 'failed',
      message_type: options?.templateKey || 'text',
      direction: 'outbound',
      event_layer: 'transport',
      message_origin: options?.origin || 'manual',
      occurred_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      sync_status: sendOk ? 'synced' : 'failed',
      provider: sentVia,
      provider_message_id: providerMsgId || null,
      error: sendOk ? null : 'Send failed',
    })
  } catch (err) {
    console.error('[sendDirectWhatsApp] Failed to record event:', err)
  }

  if (!sendOk) {
    return { success: false, sentVia, messageId, error: 'Failed to send via Gupshup' }
  }

  return { success: true, sentVia, messageId }
}
