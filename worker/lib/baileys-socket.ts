import {
  makeWASocket,
  DisconnectReason,
  initAuthCreds,
  fetchLatestBaileysVersion,
  type WASocket,
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import { getBaileysCreds, saveBaileysCreds, hasBaileysAuth, deleteBaileysAuthState } from '../stores/baileys-auth'
import { RedisBaileysKeyStore } from '../stores/baileys-keys'
import { storeQrCode, clearQrCode } from '../stores/baileys-qr'
import { setBaileysState, clearBaileysState } from '../stores/baileys-state'
import { emitWhatsAppStatusUpdated } from '../src/lib/billzo/events'
import { acquireSocketLock, releaseSocketLock, startLockRenewal } from './socket-lock'
import pino from 'pino'
import fs from 'fs'
import { spineDiagnostics } from '../src/lib/spine-diagnostics'
import { supabaseAdmin } from '../src/lib/billzo/supabase-admin'

interface SocketEntry {
  socket: WASocket
  connected: boolean
  tenantId: string
}

const sockets = new Map<string, SocketEntry>()
const intentionallyDisconnecting = new Set<string>()
const reconnectAttempts = new Map<string, number>()
const RECONNECT_BASE_MS = 1_000
const RECONNECT_MAX_MS = 60_000
let logger: ReturnType<typeof pino>

function getLogger() {
  if (!logger) {
    logger = pino({ level: process.env.BAILEYS_LOG_LEVEL || 'silent' })
  }
  return logger
}

function reconnectBackoff(tenantId: string): number {
  const attempt = reconnectAttempts.get(tenantId) ?? 0
  const delay = Math.min(RECONNECT_BASE_MS * Math.pow(2, attempt), RECONNECT_MAX_MS)
  reconnectAttempts.set(tenantId, attempt + 1)
  return delay
}

function resetReconnectBackoff(tenantId: string): void {
  reconnectAttempts.delete(tenantId)
}

export async function startBaileysSocket(tenantId: string): Promise<void> {
  console.log(`[Baileys] startBaileysSocket called for tenant: ${tenantId}`)
  if (sockets.has(tenantId)) {
    console.log(`[Baileys] Socket already exists for tenant ${tenantId}`)
    return
  }

  const lockMaxRetries = 12
  let hasLock = false
  for (let i = 0; i < lockMaxRetries; i++) {
    console.log(`[Baileys] Attempting to acquire socket lock for ${tenantId} (attempt ${i + 1}/${lockMaxRetries})...`)
    hasLock = await acquireSocketLock(tenantId)
    if (hasLock) break
    await new Promise(r => setTimeout(r, 5000))
  }
  if (!hasLock) {
    console.log(`[Baileys] Could not acquire socket lock for ${tenantId} after ${lockMaxRetries} attempts, skipping`)
    return
  }
  console.log(`[Baileys] Lock acquired for ${tenantId}`)

  let creds: any
  let keyStore: RedisBaileysKeyStore
  try {
    console.log(`[Baileys] Loading creds for ${tenantId}...`)
    creds = await getBaileysCreds(tenantId)
    keyStore = new RedisBaileysKeyStore(tenantId)

    if (creds) {
      console.log(`[Baileys] Creds loaded for ${tenantId} (id: ${creds.id})`)
      // Ensure messaging_channel exists for this already-paired tenant
      try {
        const { data: existing } = await supabaseAdmin
          .from('messaging_channels')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('provider', 'baileys')
          .maybeSingle()
        if (!existing) {
          await supabaseAdmin.from('messaging_channels').insert({
            tenant_id: tenantId,
            channel_type: 'whatsapp',
            provider: 'baileys',
            phone_number: 'baileys',
            display_name: 'WhatsApp (Baileys)',
            connection_state: 'connected',
            priority: 10,
            config: {},
            is_active: true,
          })
          console.log(`[Baileys] Created messaging_channel for already-paired tenant ${tenantId}`)
        }
      } catch (err) {
        console.error(`[Baileys] Failed to create messaging_channel for ${tenantId}:`, err)
      }
    } else {
      creds = initAuthCreds()
      console.log(`[Baileys] Initialized fresh creds for ${tenantId}`)
    }
  } catch (err) {
    console.error(`[Baileys] Failed to load auth for tenant ${tenantId}, releasing lock:`, err)
    await releaseSocketLock(tenantId)
    return
  }

  console.log(`[Baileys] Creating WASocket for ${tenantId}...`)
  let version: [number, number, number] = [2, 3000, 1019707846]
  try {
    const latest = await fetchLatestBaileysVersion()
    version = latest.version as [number, number, number]
    console.log(`[Baileys] Using version ${version.join('.')} for ${tenantId}`)
  } catch {
    console.warn(`[Baileys] Failed to fetch latest version, using default`)
  }

  const sock = makeWASocket({
    auth: { creds, keys: keyStore } as any,
    version,
    printQRInTerminal: false,
    logger: getLogger(),
    browser: ['BillZo', 'Chrome', '4.0.0'],
  })

  const entry: SocketEntry = { socket: sock, connected: false, tenantId }
  sockets.set(tenantId, entry)

  startLockRenewal(tenantId)

  sock.ev.on('creds.update', async () => {
    console.log(`[Baileys] Creds updated for ${tenantId}`)
    await saveBaileysCreds(tenantId, creds)
  })

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update
    console.log(`[Baileys] Connection update for ${tenantId}:`, { connection, hasQr: !!qr, lastDisconnect })

    if (qr) {
      console.log(`[Baileys] QR generated for tenant ${tenantId}. Storing in Redis...`)
      await storeQrCode(tenantId, qr)
      await setBaileysState(tenantId, { connectionState: 'connecting', qrGeneratedAt: new Date().toISOString() })
      console.log(`[Baileys] QR stored for ${tenantId}`)
    }

    if (qr === undefined && connection !== 'open') {
      await clearQrCode(tenantId)
    }

    if (connection === 'open') {
      entry.connected = true
      const now = new Date().toISOString()
      console.log(`[Baileys] Connected for tenant ${tenantId}`)
      resetReconnectBackoff(tenantId)
      await clearQrCode(tenantId)
      await setBaileysState(tenantId, { connectionState: 'connected', lastConnectedAt: now, lastHeartbeatAt: now, error: null })

      // Auto-create messaging_channel if it doesn't exist
      try {
        const { data: existing } = await supabaseAdmin
          .from('messaging_channels')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('provider', 'baileys')
          .maybeSingle()
        if (!existing) {
          await supabaseAdmin.from('messaging_channels').insert({
            tenant_id: tenantId,
            channel_type: 'whatsapp',
            provider: 'baileys',
            phone_number: 'baileys',
            display_name: 'WhatsApp (Baileys)',
            connection_state: 'connected',
            priority: 10,
            config: {},
            is_active: true,
          })
          console.log(`[Baileys] Created messaging_channel for tenant ${tenantId}`)
        }
      } catch (err) {
        console.error(`[Baileys] Failed to create messaging_channel for ${tenantId}:`, err)
      }
    }

    if (connection === 'close') {
      entry.connected = false
      const isIntentional = intentionallyDisconnecting.has(tenantId)
      intentionallyDisconnecting.delete(tenantId)

      // Always clear stale QR — a dead socket's QR is worthless
      await clearQrCode(tenantId)

      if (isIntentional) {
        await releaseSocketLock(tenantId)
        sockets.delete(tenantId)
        console.log(`[Baileys] Intentional disconnect for tenant ${tenantId}, not reconnecting`)
        return
      }

      await releaseSocketLock(tenantId)
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode
      const errorMessage = (lastDisconnect?.error as Error)?.message || ''
      const isLoggedOut = statusCode === DisconnectReason.loggedOut
      const isQrRefsExhausted = statusCode === DisconnectReason.badSession || errorMessage.includes('QR refs')
      console.log(`[Baileys] Disconnected for tenant ${tenantId}: loggedOut=${isLoggedOut} qrExhausted=${isQrRefsExhausted} statusCode=${statusCode}`)

      if (isLoggedOut) {
        await setBaileysState(tenantId, { connectionState: 'auth_expired', error: 'logged_out' })
        await deleteBaileysAuthState(tenantId)
        await clearBaileysState(tenantId)
        sockets.delete(tenantId)
        console.log(`[Baileys] Logged out for tenant ${tenantId}, auth cleared`)
      } else if (isQrRefsExhausted) {
        console.log(`[Baileys] QR refs exhausted for ${tenantId}, stopping auto-reconnect`)
        await setBaileysState(tenantId, { connectionState: 'disconnected', error: 'qr_refs_exhausted' })
        sockets.delete(tenantId)
      } else {
        const delay = reconnectBackoff(tenantId)
        console.log(`[Baileys] Reconnecting ${tenantId} in ${delay}ms (attempt ${reconnectAttempts.get(tenantId)})`)
        await setBaileysState(tenantId, { connectionState: 'reconnecting', error: `reconnect_in_${delay}ms` })
        setTimeout(() => {
          sockets.delete(tenantId)
          startBaileysSocket(tenantId)
        }, delay)
      }
    }
  })

  sock.ev.on('messages.upsert', (m) => {
    for (const msg of m.messages) {
      if (msg.key.fromMe) continue
      console.log(`[Baileys] Inbound message for tenant ${tenantId}:`, msg.key.id)
    }
  })

  sock.ev.on('messages.update', async (updates) => {
    for (const { key, update } of updates) {
      if (!key.fromMe) continue
      const msgId = key.id
      if (!msgId) continue

      const status = update.status as number | undefined
      let ourStatus: string | null = null
      const now = new Date().toISOString()

      if (status === 2) {
        ourStatus = 'server_ack'
      } else if (status === 3) {
        ourStatus = 'delivered'
      } else if (status === 4) {
        ourStatus = 'read'
      } else if (status === 0) {
        ourStatus = 'failed'
      }

      if (!ourStatus) continue

      try {
        let resolvedBillzoMessageId: string | null = null
        let resolvedInvoiceId: string | null = null
        if (msgId) {
          const { data: msg } = await supabaseAdmin
            .from('whatsapp_events')
            .select('billzo_message_id, invoice_id')
            .or(`provider_message_id.eq.${msgId},billzo_message_id.eq.${msgId}`)
            .limit(1)
            .maybeSingle()
          if (msg) {
            resolvedBillzoMessageId = msg.billzo_message_id
            resolvedInvoiceId = msg.invoice_id
          }
        }

        await emitWhatsAppStatusUpdated({
          billzoMessageId: resolvedBillzoMessageId,
          invoiceId: resolvedInvoiceId,
          tenantId,
          status: ourStatus,
          provider: 'baileys',
          providerMessageId: msgId,
          timestamp: now,
        })
      } catch (err) {
        console.error(`[Baileys] Failed to emit status update for ${msgId}:`, err)
      }
    }
  })
}

export function getBaileysSocket(tenantId: string): WASocket | null {
  const entry = sockets.get(tenantId)
  if (!entry || !entry.connected) return null
  return entry.socket
}

export function isBaileysConnected(tenantId: string): boolean {
  return sockets.get(tenantId)?.connected ?? false
}

export async function isBaileysPaired(tenantId: string): Promise<boolean> {
  if (sockets.has(tenantId)) return true
  return hasBaileysAuth(tenantId)
}

export async function stopBaileysSocket(tenantId: string): Promise<void> {
  const entry = sockets.get(tenantId)
  if (entry) {
    intentionallyDisconnecting.add(tenantId)
    entry.socket.end(undefined)
    sockets.delete(tenantId)
  }
}

export async function disconnectBaileys(tenantId: string): Promise<void> {
  intentionallyDisconnecting.add(tenantId)
  await stopBaileysSocket(tenantId)
  await deleteBaileysAuthState(tenantId)
  await releaseSocketLock(tenantId)
  await clearBaileysState(tenantId)
}

export async function sendViaBaileys(
  tenantId: string,
  phone: string,
  message: string,
): Promise<{ messageId: string }> {
  const sock = getBaileysSocket(tenantId)
  if (!sock) {
    throw new Error('Baileys not connected for this tenant')
  }

  const jid = `${phone.replace(/\D/g, '')}@s.whatsapp.net`
  const result = await sock.sendMessage(jid, { text: message })
  return { messageId: result?.key?.id || `baileys_${Date.now()}` }
}

export async function sendBaileysDocument(
  tenantId: string,
  phone: string,
  url: string,
  fileName: string,
  caption?: string,
): Promise<{ messageId: string }> {
  const sock = getBaileysSocket(tenantId)
  if (!sock) {
    throw new Error('Baileys not connected for this tenant')
  }

  const jid = `${phone.replace(/\D/g, '')}@s.whatsapp.net`
  // Support local file paths — read as Buffer for Baileys
  const document: any = (url.startsWith('/') || url.startsWith('file://'))
    ? fs.readFileSync(url.startsWith('file://') ? url.slice(7) : url)
    : { url }
  const result = await sock.sendMessage(jid, {
    document,
    fileName,
    caption,
    mimetype: 'application/pdf',
  })
  return { messageId: result?.key?.id || `baileys_${Date.now()}` }
}

export async function sendBaileysImage(
  tenantId: string,
  phone: string,
  url: string,
  caption?: string,
): Promise<{ messageId: string }> {
  const sock = getBaileysSocket(tenantId)
  if (!sock) {
    throw new Error('Baileys not connected for this tenant')
  }

  const jid = `${phone.replace(/\D/g, '')}@s.whatsapp.net`
  const result = await sock.sendMessage(jid, {
    image: { url },
    caption,
  })
  return { messageId: result?.key?.id || `baileys_${Date.now()}` }
}
