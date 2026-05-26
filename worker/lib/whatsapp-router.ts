import { supabaseAdmin } from '../src/lib/billzo/supabase-admin'
import { sendViaBaileys, isBaileysConnected, isBaileysPaired, sendBaileysDocument } from './baileys-socket'

export type WhatsAppProvider = 'gupshup' | 'baileys'
export type MessageType = 'text' | 'document' | 'image'

interface SendResult {
  messageId: string
  provider: WhatsAppProvider
}

interface WhatsAppConfig {
  provider: WhatsAppProvider
  gupshupApiKey?: string
  gupshupAppName?: string
  sourceNumber?: string
}

export async function resolveWhatsAppConfig(tenantId: string): Promise<WhatsAppConfig> {
  const envProvider = process.env.WHATSAPP_PROVIDER as WhatsAppProvider | undefined

  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('whatsapp_config')
    .eq('id', tenantId)
    .single()

  const config = (tenant?.whatsapp_config || {}) as Record<string, any>
  const provider: WhatsAppProvider = config.whatsappProvider || envProvider || 'gupshup'

  return {
    provider,
    gupshupApiKey: config.gupshupApiKey,
    gupshupAppName: config.gupshupAppName,
    sourceNumber: config.sourceNumber,
  }
}

export async function sendViaGupshup(
  apiKey: string,
  appName: string,
  source: string,
  destination: string,
  message: string,
): Promise<{ messageId: string }> {
  const payload = new URLSearchParams({
    api_key: apiKey,
    app_name: appName,
    channel: 'whatsapp',
    source,
    destination: destination.replace(/\D/g, '').replace(/^91/, ''),
    message,
  })

  const res = await fetch('https://api.gupshup.io/sm/api/v1/msg', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: payload.toString(),
  })

  const data = await res.json() as any
  if (!res.ok && data.status !== 'queued') {
    throw new Error(data.error || `Gupshup error: ${res.status}`)
  }
  return { messageId: data.messageId || `wa_${Date.now()}` }
}

export async function sendWhatsAppMessage(
  tenantId: string,
  phone: string,
  message: string,
  type: MessageType = 'text',
  documentUrl?: string,
  documentName?: string,
): Promise<SendResult> {
  const config = await resolveWhatsAppConfig(tenantId)
  const cleanPhone = phone.replace(/\D/g, '')

  if (config.provider === 'baileys') {
    if (!(await isBaileysPaired(tenantId))) {
      console.log(`[WhatsAppRouter] Baileys not paired for tenant ${tenantId}, falling back to Gupshup`)
    } else if (!isBaileysConnected(tenantId)) {
      console.log(`[WhatsAppRouter] Baileys not connected for tenant ${tenantId}, falling back to Gupshup`)
    } else {
      try {
        if (type === 'document' && documentUrl) {
          const result = await sendBaileysDocument(tenantId, cleanPhone, documentUrl, documentName || 'document.pdf', message)
          return { messageId: result.messageId, provider: 'baileys' }
        }
        const result = await sendViaBaileys(tenantId, cleanPhone, message)
        return { messageId: result.messageId, provider: 'baileys' }
      } catch (err) {
        console.log(`[WhatsAppRouter] Baileys send failed for tenant ${tenantId}, falling back to Gupshup:`, err)
      }
    }
  }

  if (!config.gupshupApiKey || !config.gupshupAppName || !config.sourceNumber) {
    console.log(`[WhatsAppRouter] No Gupshup config for tenant ${tenantId}, simulating send to ${cleanPhone}`)
    return { messageId: `sim_${Date.now()}`, provider: 'gupshup' }
  }

  const result = await sendViaGupshup(
    config.gupshupApiKey,
    config.gupshupAppName,
    config.sourceNumber,
    `+${cleanPhone}`,
    message,
  )

  return { messageId: result.messageId, provider: 'gupshup' }
}

export async function getEffectiveProvider(tenantId: string): Promise<WhatsAppProvider> {
  const config = await resolveWhatsAppConfig(tenantId)
  if (config.provider === 'baileys' && (await isBaileysPaired(tenantId)) && isBaileysConnected(tenantId)) {
    return 'baileys'
  }
  return 'gupshup'
}
