import { supabaseAdmin } from '../src/lib/billzo/supabase-admin'
import { isBaileysConnected, isBaileysPaired, startBaileysSocket } from './baileys-socket'
import { getRedis } from './redis'
import { TransportRegistry } from '../src/lib/transport/registry'
import {
  generateBillzoMessageId,
  generateEventSequence,
  computeTransportHash,
  type MessageIdentity,
  type MessageOrigin,
  type WhatsAppProvider,
} from '@billzo/shared'

export type MessageType = 'text' | 'document' | 'image'

let registry: TransportRegistry | null = null

const DISABLE_RATE_LIMIT = process.env.DISABLE_RATE_LIMIT === 'true'

const RATE_LIMITS = {
  perPhonePer30s: 1,
  perTenantPerHour: 5,
  perTenantPerDay: 20,
}

// Redis key prefixes
const RL_PHONE_KEY = 'rl:phone'
const RL_TENANT_HOUR_KEY = 'rl:tenant:hour'
const RL_TENANT_DAY_KEY = 'rl:tenant:day'

// In-memory fallback store: tenantId -> phone -> timestamps[]
const memRateLimitStore = new Map<string, Map<string, number[]>>()
let redisAvailable = true

async function checkAndRecordRedis(tenantId: string, phone: string): Promise<string | null> {
  const now = Date.now()
  const thirtySecAgo = now - 30000
  const hourAgo = now - 3600000
  const dayAgo = now - 86400000

  try {
    const redis = getRedis()
    if (!redis) throw new Error('Redis not available')

    const multi = redis.multi()

    // Per-phone: 1 msg per 30s — trim old + count + add
    const phoneKey = `${RL_PHONE_KEY}:${tenantId}:${phone}`
    multi.zremrangebyscore(phoneKey, 0, thirtySecAgo)
    multi.zcard(phoneKey)

    // Per-tenant hourly
    const hourKey = `${RL_TENANT_HOUR_KEY}:${tenantId}`
    multi.zremrangebyscore(hourKey, 0, hourAgo)
    multi.zcard(hourKey)

    // Per-tenant daily
    const dayKey = `${RL_TENANT_DAY_KEY}:${tenantId}`
    multi.zremrangebyscore(dayKey, 0, dayAgo)
    multi.zcard(dayKey)

    const results = await multi.exec()
    if (!results) throw new Error('Redis multi exec returned null')

    // results is [error, result][] — check for errors
    const phoneCount = Number(results[1]?.[1] ?? 0)
    const hourCount = Number(results[3]?.[1] ?? 0)
    const dayCount = Number(results[5]?.[1] ?? 0)

    if (phoneCount >= RATE_LIMITS.perPhonePer30s) {
      return `Rate limited: max ${RATE_LIMITS.perPhonePer30s} message per 30s per phone`
    }
    if (hourCount >= RATE_LIMITS.perTenantPerHour) {
      return `Rate limited: max ${RATE_LIMITS.perTenantPerHour} messages per hour for tenant`
    }
    if (dayCount >= RATE_LIMITS.perTenantPerDay) {
      return `Rate limited: max ${RATE_LIMITS.perTenantPerDay} messages per day for tenant`
    }

    // Record this send
    const addMulti = redis.multi()
    addMulti.zadd(phoneKey, now, `${now}:${Math.random()}`)
    addMulti.zadd(hourKey, now, `${now}:${Math.random()}`)
    addMulti.zadd(dayKey, now, `${now}:${Math.random()}`)
    addMulti.expire(phoneKey, 60)
    addMulti.expire(hourKey, 7200)
    addMulti.expire(dayKey, 172800)
    await addMulti.exec()

    redisAvailable = true
    return null
  } catch (err: any) {
    if (redisAvailable) {
      console.warn('[WhatsAppRouter] Redis rate limit failed, falling back to in-memory:', err.message)
      redisAvailable = false
    }
    return checkAndRecordMem(tenantId, phone)
  }
}

function checkAndRecordMem(tenantId: string, phone: string): string | null {
  const now = Date.now()
  const thirtySecAgo = now - 30000
  const hourAgo = now - 3600000
  const dayAgo = now - 86400000

  const phoneBuckets = memRateLimitStore.get(tenantId)
  if (phoneBuckets) {
    const phoneTimestamps = phoneBuckets.get(phone)
    if (phoneTimestamps) {
      const recent = phoneTimestamps.filter(t => t > thirtySecAgo)
      phoneBuckets.set(phone, recent)
      if (recent.length >= RATE_LIMITS.perPhonePer30s) {
        return `Rate limited: max ${RATE_LIMITS.perPhonePer30s} message per 30s per phone`
      }
    }
  }

  let hourCount = 0
  for (const [tId, phones] of memRateLimitStore) {
    if (tId === tenantId) {
      for (const ts of phones.values()) {
        hourCount += ts.filter(t => t > hourAgo).length
      }
    }
  }
  if (hourCount >= RATE_LIMITS.perTenantPerHour) {
    return `Rate limited: max ${RATE_LIMITS.perTenantPerHour} messages per hour for tenant`
  }

  let dayCount = 0
  for (const [tId, phones] of memRateLimitStore) {
    if (tId === tenantId) {
      for (const ts of phones.values()) {
        dayCount += ts.filter(t => t > dayAgo).length
      }
    }
  }
  if (dayCount >= RATE_LIMITS.perTenantPerDay) {
    return `Rate limited: max ${RATE_LIMITS.perTenantPerDay} messages per day for tenant`
  }

  let phones = memRateLimitStore.get(tenantId)
  if (!phones) {
    phones = new Map()
    memRateLimitStore.set(tenantId, phones)
  }
  let timestamps = phones.get(phone)
  if (!timestamps) {
    timestamps = []
    phones.set(phone, timestamps)
  }
  timestamps.push(now)

  return null
}

export function setTransportRegistry(r: TransportRegistry): void {
  registry = r
}

async function getActiveChannel(tenantId: string): Promise<{
  id: string
  provider: string
  phoneNumber: string
} | null> {
  // 1. Check messaging_channels table
  const { data } = await supabaseAdmin
    .from('messaging_channels')
    .select('id, provider, phone_number')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('priority', { ascending: true })
    .limit(1)
    .single()

  if (data) return { id: data.id, provider: data.provider, phoneNumber: data.phone_number }

  // 2. Fallback: check Redis for Baileys creds and auto-create channel
  try {
    const redis = getRedis()
    const hasCreds = await redis.exists(`baileys:creds:${tenantId}`)
    if (hasCreds) {
      // Check if already exists (race condition guard)
      const { data: existing } = await supabaseAdmin
        .from('messaging_channels')
        .select('id, provider, phone_number')
        .eq('tenant_id', tenantId)
        .eq('provider', 'baileys')
        .maybeSingle()
      if (existing) return { id: existing.id, provider: existing.provider, phoneNumber: existing.phone_number }

      const { data: newChannel } = await supabaseAdmin
        .from('messaging_channels')
        .insert({
          tenant_id: tenantId,
          channel_type: 'whatsapp',
          provider: 'baileys',
          phone_number: 'baileys',
          connection_state: 'connected',
          priority: 10,
          config: {},
          is_active: true,
        })
        .select('id, provider, phone_number')
        .maybeSingle()

      if (newChannel) {
        console.log(`[WhatsAppRouter] Auto-created Baileys channel for ${tenantId} from Redis creds, starting socket...`)
        // Start the Baileys socket asynchronously — next outbox poll will find it connected
        startBaileysSocket(tenantId).catch((err) =>
          console.error(`[WhatsAppRouter] Failed to start Baileys socket for ${tenantId}:`, err)
        )
        return { id: newChannel.id, provider: newChannel.provider, phoneNumber: newChannel.phone_number }
      }
    }
  } catch {
    // Redis not available
  }

  // 3. Fallback: check tenants.whatsapp_config
  try {
    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('whatsapp_config')
      .eq('id', tenantId)
      .single()

    const cfg = tenant?.whatsapp_config as Record<string, any> | null
    if (cfg?.whatsappProvider === 'baileys' || cfg?.whatsappProvider === 'gupshup') {
      // Check if already exists
      const { data: existing } = await supabaseAdmin
        .from('messaging_channels')
        .select('id, provider, phone_number')
        .eq('tenant_id', tenantId)
        .eq('provider', cfg.whatsappProvider)
        .maybeSingle()
      if (existing) return { id: existing.id, provider: existing.provider, phoneNumber: existing.phone_number }

      const { data: newChannel } = await supabaseAdmin
        .from('messaging_channels')
        .insert({
          tenant_id: tenantId,
          channel_type: 'whatsapp',
          provider: cfg.whatsappProvider,
          phone_number: cfg.sourceNumber || cfg.whatsappProvider,
          connection_state: 'connected',
          priority: cfg.whatsappProvider === 'baileys' ? 10 : 0,
          config: cfg,
          is_active: true,
        })
        .select('id, provider, phone_number')
        .maybeSingle()

      if (newChannel) {
        console.log(`[WhatsAppRouter] Auto-created ${cfg.whatsappProvider} channel for ${tenantId} from tenant config`)
        if (cfg.whatsappProvider === 'baileys') {
          startBaileysSocket(tenantId).catch((err) =>
            console.error(`[WhatsAppRouter] Failed to start Baileys socket for ${tenantId}:`, err)
          )
        }
        return { id: newChannel.id, provider: newChannel.provider, phoneNumber: newChannel.phone_number }
      }
    }
  } catch {
    // Tenant query failed
  }

  return null
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
  const cleanPhone = phone.replace(/\D/g, '')
  if (cleanPhone.length < 10) {
    const billzoMessageId = generateBillzoMessageId()
    return {
      messageId: billzoMessageId,
      provider: 'gupshup' as WhatsAppProvider,
      identity: {
        billzoMessageId,
        conversationId: `conv_${cleanPhone}`,
        messageOrigin: options?.messageOrigin || 'automation',
        parentBillzoMessageId: options?.parentBillzoMessageId || null,
        transportMessageHash: '',
        eventSequence: 0n,
        attemptNumber: options?.attemptNumber || 1,
        reminderStage: options?.reminderStage || null,
      },
      error: `Invalid phone number: "${phone}"`,
    }
  }

  const rateLimitError = DISABLE_RATE_LIMIT ? null : await checkAndRecordRedis(tenantId, cleanPhone)
  if (rateLimitError) {
    console.warn(`[WhatsAppRouter] ${rateLimitError} — tenant=${tenantId} phone=${cleanPhone}`)
    const billzoMessageId = generateBillzoMessageId()
    return {
      messageId: billzoMessageId,
      provider: 'gupshup' as WhatsAppProvider,
      identity: {
        billzoMessageId,
        conversationId: `conv_${cleanPhone}`,
        messageOrigin: options?.messageOrigin || 'automation',
        parentBillzoMessageId: options?.parentBillzoMessageId || null,
        transportMessageHash: '',
        eventSequence: 0n,
        attemptNumber: options?.attemptNumber || 1,
        reminderStage: options?.reminderStage || null,
      },
      error: rateLimitError,
    }
  }

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

  try {
    const channel = await getActiveChannel(tenantId)
    if (!channel) {
      console.log(`[WhatsAppRouter] No active channel for tenant ${tenantId}, simulating send to ${cleanPhone}`)
      return {
        messageId: billzoMessageId,
        provider: 'gupshup',
        identity,
        error: undefined,
      }
    }

    if (!registry) {
      return {
        messageId: billzoMessageId,
        provider: channel.provider as WhatsAppProvider,
        identity,
        error: 'Transport registry not initialized',
      }
    }

    // Determine provider: try Baileys if paired (even if temporarily disconnected), else Gupshup
    let effectiveProvider = channel.provider
    if (effectiveProvider === 'baileys' && !(await isBaileysPaired(tenantId))) {
      console.log(`[WhatsAppRouter] Baileys not paired for tenant ${tenantId}, falling back`)
      effectiveProvider = 'gupshup'
    }

    const sendResult = await registry.send(channel.id, {
      to: cleanPhone,
      text: message,
      ...(options?.type === 'document' && options?.documentUrl
        ? { document: { url: options.documentUrl, fileName: options.documentName || 'document.pdf', caption: message } }
        : {}),
    }, { provider: effectiveProvider })

    if (sendResult.success) {
      return {
        messageId: sendResult.providerMessageId || billzoMessageId,
        provider: effectiveProvider as WhatsAppProvider,
        identity,
      }
    }

    // Primary provider failed — try fallback Gupshup channel
    const fallbackChannel = await supabaseAdmin
      .from('messaging_channels')
      .select('id, provider, config')
      .eq('tenant_id', tenantId)
      .eq('provider', 'gupshup')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()

    if (fallbackChannel.data) {
      const fbConfig = fallbackChannel.data.config as Record<string, any> | null
      if (fbConfig?.gupshupApiKey && fbConfig?.gupshupAppName && fbConfig?.sourceNumber) {
        const fallbackResult = await registry.send(fallbackChannel.data.id, {
          to: cleanPhone,
          text: message,
        }, { provider: 'gupshup' })

        if (fallbackResult.success) {
          return {
            messageId: fallbackResult.providerMessageId || billzoMessageId,
            provider: 'gupshup',
            identity,
          }
        }
      }
    }

    return {
      messageId: billzoMessageId,
      provider: effectiveProvider as WhatsAppProvider,
      identity,
      error: sendResult.error || 'Send failed',
    }
  } catch (err: any) {
    console.log(`[WhatsAppRouter] Send failed for tenant ${tenantId}:`, err.message)
    return {
      messageId: billzoMessageId,
      provider: 'gupshup',
      identity,
      error: err.message,
    }
  }
}

export async function getEffectiveProvider(tenantId: string): Promise<WhatsAppProvider> {
  const channel = await getActiveChannel(tenantId)
  if (!channel) return 'gupshup'
  if (channel.provider === 'baileys' && (await isBaileysPaired(tenantId)) && isBaileysConnected(tenantId)) {
    return 'baileys'
  }
  return 'gupshup'
}
