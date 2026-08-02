import { supabaseAdmin } from './supabase-admin'
import { randomUUID } from 'crypto'
import { createRedisClient } from './redis'
import { TransportRegistry, MetaAdapter, GupshupAdapter, SimulationAdapter } from '@billzo/shared'
import type { OutboundMessage } from '@billzo/shared'

function interpolate(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{\{(\d+)\}\}/g, (_, n) => String(vars[n] ?? ''))
}

export type SendResult =
  | { success: true; sentVia: 'gupshup' | 'meta'; messageId: string }
  | { success: false; sentVia: 'baileys' | 'gupshup' | 'meta' | 'none'; messageId?: string; error: string }

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
    // Pilot fallback: Meta is infrastructure, configured once from the environment.
    if (process.env.META_ACCESS_TOKEN && process.env.META_PHONE_NUMBER_ID) {
      provider = 'meta'
    }
  }

  if (!provider) {
    return { success: false, sentVia: 'none', error: 'No active messaging channel configured. Go to Settings > WhatsApp to set up.' }
  }

  // 3. Resolve final message (template or raw text) before routing
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

  const messageId = options?.invoiceId
    ? `manual_${options.invoiceId.slice(0, 12)}`
    : `manual_${randomUUID().slice(0, 12)}`

  // 4. Route by provider via the shared TransportRegistry
  if (provider === 'baileys') {
    // Worker handles send via Baileys; caller writes outbox events
    return { success: false, sentVia: 'baileys', error: 'Baileys requires worker' }
  }

  if (provider !== 'meta' && provider !== 'gupshup' && provider !== 'simulation') {
    return { success: false, sentVia: 'none', error: `Unsupported provider: ${provider}` }
  }

  const registry = buildRegistry(provider, channelConfig)
  const outbound: OutboundMessage = { to: cleanPhone, text: finalMessage }
  const result = await registry.send('manual', outbound, { provider })

  // 6. Record in whatsapp_events
  await recordEvent(
    tenantId,
    customerId,
    cleanPhone,
    options,
    messageId,
    provider,
    result.success,
    result.providerMessageId,
  )

  if (!result.success) {
    return { success: false, sentVia: provider as any, messageId, error: result.error || `Failed to send via ${provider}` }
  }

  return { success: true, sentVia: provider as any, messageId: messageId || result.providerMessageId || `manual_${randomUUID().slice(0, 12)}` }
}

function buildRegistry(provider: string, channelConfig: Record<string, any> | null): TransportRegistry {
  const registry = new TransportRegistry()
  registry.register(new SimulationAdapter())

  if (provider === 'meta') {
    registry.register(new MetaAdapter())
  }

  if (provider === 'gupshup' && channelConfig) {
    registry.register(
      new GupshupAdapter({
        configResolver: async () => {
          const gKey = channelConfig?.gupshupApiKey
          const gApp = channelConfig?.gupshupAppName
          const gSrc = channelConfig?.sourceNumber
          if (!gKey || !gApp || !gSrc) return null
          return { apiKey: gKey as string, appName: gApp as string, sourceNumber: gSrc as string }
        },
      }),
    )
  }

  return registry
}

async function recordEvent(
  tenantId: string,
  customerId: string,
  cleanPhone: string,
  options: { invoiceId?: string | null; templateKey?: string | null; origin?: string } | undefined,
  messageId: string | undefined,
  provider: string,
  sendOk: boolean,
  providerMsgId: string | null,
): Promise<void> {
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
      provider,
      provider_message_id: providerMsgId || null,
      error: sendOk ? null : 'Send failed',
    })
  } catch (err) {
    console.error('[sendDirectWhatsApp] Failed to record event:', err)
  }
}
