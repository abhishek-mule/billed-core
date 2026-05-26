import { supabaseAdmin } from '../src/lib/billzo/supabase-admin'
import { sendViaBaileys, isBaileysConnected, isBaileysPaired, sendBaileysDocument } from './baileys-socket'
import { createRedisConnection } from './redis'
import { emitWhatsAppCircuitOpen } from '../src/lib/billzo/events'
import {
  type WhatsAppProvider,
  generateBillzoMessageId,
  generateEventSequence,
  computeTransportHash,
  type MessageIdentity,
  type MessageOrigin,
} from '@billzo/shared'
export type MessageType = 'text' | 'document' | 'image'

const CIRCUIT_THRESHOLD = 5
const CIRCUIT_TTL = 3600

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

async function getRedis(): Promise<ReturnType<typeof createRedisConnection>> {
  return createRedisConnection()
}

/**
 * Check circuit breaker state for a tenant.
 * Returns true if circuit is open (too many failures, skip Baileys).
 */
async function isCircuitOpen(tenantId: string): Promise<boolean> {
  try {
    const redis = await getRedis()
    const raw = await redis.get(`circuit:${tenantId}`)
    if (!raw) return false
    const state = JSON.parse(raw)
    if (state.open) {
      if (Date.now() - state.openedAt > CIRCUIT_TTL * 1000) {
        await redis.del(`circuit:${tenantId}`)
        redis.disconnect()
        return false
      }
      redis.disconnect()
      return true
    }
    redis.disconnect()
    return false
  } catch {
    return false
  }
}

/**
 * Record a successful send — reset circuit counter.
 */
async function recordSendSuccess(tenantId: string): Promise<void> {
  try {
    const redis = await getRedis()
    await redis.del(`circuit:${tenantId}`)
    redis.disconnect()
  } catch {
    // non-critical
  }
}

/**
 * Record a failed send — increment circuit counter, open circuit if threshold exceeded.
 */
async function recordSendFailure(tenantId: string): Promise<void> {
  try {
    const redis = await getRedis()
    const raw = await redis.get(`circuit:${tenantId}`)
    const now = Date.now()

    if (raw) {
      const state = JSON.parse(raw)
      state.failures = (state.failures || 0) + 1
      if (state.failures >= CIRCUIT_THRESHOLD) {
        state.open = true
        state.openedAt = now
        await redis.set(`circuit:${tenantId}`, JSON.stringify(state), 'EX', CIRCUIT_TTL)
        redis.disconnect()
        await emitWhatsAppCircuitOpen({
          tenantId,
          failures: state.failures,
        })
        return
      }
      await redis.set(`circuit:${tenantId}`, JSON.stringify(state), 'EX', CIRCUIT_TTL)
    } else {
      await redis.set(`circuit:${tenantId}`, JSON.stringify({ failures: 1, open: false }), 'EX', CIRCUIT_TTL)
    }
    redis.disconnect()
  } catch {
    // non-critical
  }
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
  options?: {
    type?: MessageType
    documentUrl?: string
    documentName?: string
    invoiceId?: string | null
    customerId?: string | null
    reminderStage?: string | null
    attemptNumber?: number
    parentBillzoMessageId?: string | null
    conversationId?: string | null
    messageOrigin?: MessageOrigin
    amount?: number
  },
): Promise<{
  messageId: string
  provider: WhatsAppProvider
  identity: MessageIdentity
  error?: string
}> {
  const config = await resolveWhatsAppConfig(tenantId)
  const cleanPhone = phone.replace(/\D/g, '')

  // Generate canonical identity BEFORE send — preserves identity even on failure
  const eventSequence = generateEventSequence()
  const conversationId = options?.conversationId || options?.invoiceId || `conv_${cleanPhone}`
  const transportMessageHash = computeTransportHash({
    phone: cleanPhone,
    message,
    invoiceId: options?.invoiceId,
    amount: options?.amount,
    reminderStage: options?.reminderStage,
    attemptNumber: options?.attemptNumber,
  })
  const billzoMessageId = generateBillzoMessageId()

  const identity: MessageIdentity = {
    billzoMessageId,
    conversationId,
    messageOrigin: options?.messageOrigin || 'automation',
    parentBillzoMessageId: options?.parentBillzoMessageId || null,
    transportMessageHash,
    eventSequence,
    attemptNumber: options?.attemptNumber || 1,
    reminderStage: options?.reminderStage || null,
  }

  // Attempt send — never throw, capture error in result
  try {
    const sendResult = await doSend(config, tenantId, cleanPhone, message, options)
    return { ...sendResult, identity }
  } catch (err: any) {
    console.log(`[WhatsAppRouter] Send failed for tenant ${tenantId}:`, err.message)
    return {
      messageId: billzoMessageId,
      provider: config.provider,
      identity,
      error: err.message,
    }
  }
}

async function doSend(
  config: WhatsAppConfig,
  tenantId: string,
  cleanPhone: string,
  message: string,
  options?: {
    type?: MessageType
    documentUrl?: string
    documentName?: string
  },
): Promise<SendResult> {
  if (config.provider === 'baileys') {
    if (!(await isBaileysPaired(tenantId))) {
      console.log(`[WhatsAppRouter] Baileys not paired for tenant ${tenantId}, falling back to Gupshup`)
    } else if (!isBaileysConnected(tenantId)) {
      console.log(`[WhatsAppRouter] Baileys not connected for tenant ${tenantId}, falling back to Gupshup`)
    } else if (await isCircuitOpen(tenantId)) {
      console.log(`[WhatsAppRouter] Circuit open for tenant ${tenantId}, falling back to Gupshup`)
    } else {
      let result: { messageId: string }
      const type = options?.type || 'text'
      if (type === 'document' && options?.documentUrl) {
        result = await sendBaileysDocument(tenantId, cleanPhone, options.documentUrl, options.documentName || 'document.pdf', message)
      } else {
        result = await sendViaBaileys(tenantId, cleanPhone, message)
      }
      await recordSendSuccess(tenantId)
      return { messageId: result.messageId, provider: 'baileys' }
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
  if (config.provider === 'baileys' && (await isBaileysPaired(tenantId)) && isBaileysConnected(tenantId) && !(await isCircuitOpen(tenantId))) {
    return 'baileys'
  }
  return 'gupshup'
}
