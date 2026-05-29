import { supabaseAdmin } from '../src/lib/billzo/supabase-admin'
import { isBaileysConnected, isBaileysPaired } from './baileys-socket'
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

export function setTransportRegistry(r: TransportRegistry): void {
  registry = r
}

async function getActiveChannel(tenantId: string): Promise<{
  id: string
  provider: string
  phoneNumber: string
} | null> {
  const { data } = await supabaseAdmin
    .from('messaging_channels')
    .select('id, provider, phone_number')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('priority', { ascending: true })
    .limit(1)
    .single()

  return data ? { id: data.id, provider: data.provider, phoneNumber: data.phone_number } : null
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

    // Resolve effective provider: use baileys only if paired + connected, otherwise fallback
    let effectiveProvider = channel.provider
    if (effectiveProvider === 'baileys') {
      if (!(await isBaileysPaired(tenantId)) || !isBaileysConnected(tenantId)) {
        console.log(`[WhatsAppRouter] Baileys not available for tenant ${tenantId}, falling back`)
        effectiveProvider = 'gupshup'
      }
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

    // Primary provider failed — try fallback
    if (effectiveProvider === 'baileys') {
      const fallbackChannel = await supabaseAdmin
        .from('messaging_channels')
        .select('id, provider')
        .eq('tenant_id', tenantId)
        .eq('provider', 'gupshup')
        .eq('is_active', true)
        .limit(1)
        .single()

      if (fallbackChannel.data) {
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
