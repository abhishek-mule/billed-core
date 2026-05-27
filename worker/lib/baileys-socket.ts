import {
  makeWASocket,
  DisconnectReason,
  type WASocket,
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import { getBaileysAuthState, saveBaileysAuthState, hasBaileysAuth, deleteBaileysAuthState } from '../stores/baileys-auth'
import { storeQrCode, clearQrCode } from '../stores/baileys-qr'
import { emitWhatsAppStatusUpdated } from '../src/lib/billzo/events'
import { acquireSocketLock, releaseSocketLock, startLockRenewal } from './socket-lock'
import pino from 'pino'

interface SocketEntry {
  socket: WASocket
  connected: boolean
  tenantId: string
}

const sockets = new Map<string, SocketEntry>()
let logger: ReturnType<typeof pino>

function getLogger() {
  if (!logger) {
    logger = pino({ level: process.env.BAILEYS_LOG_LEVEL || 'silent' })
  }
  return logger
}

export async function startBaileysSocket(tenantId: string): Promise<void> {
  if (sockets.has(tenantId)) {
    console.log(`[Baileys] Socket already exists for tenant ${tenantId}`)
    return
  }

  // Distributed lock — prevents multiple workers starting sockets for the same tenant
  const hasLock = await acquireSocketLock(tenantId)
  if (!hasLock) {
    console.log(`[Baileys] Socket lock held by another worker for tenant ${tenantId}, skipping`)
    return
  }

  let authState: any
  try {
    const loaded = await getBaileysAuthState(tenantId)
    authState = loaded || { creds: {} as any, keys: {} as any }
  } catch (err) {
    console.error(`[Baileys] Failed to load auth for tenant ${tenantId}, releasing lock:`, err)
    await releaseSocketLock(tenantId)
    return
  }

  const sock = makeWASocket({
    auth: authState,
    printQRInTerminal: true,
    logger: getLogger(),
    browser: ['BillZo', 'Chrome', '4.0.0'],
  })

  const entry: SocketEntry = { socket: sock, connected: false, tenantId }
  sockets.set(tenantId, entry)

  // Start auto-renewal of the lock
  startLockRenewal(tenantId)

  sock.ev.on('creds.update', async () => {
    await saveBaileysAuthState(tenantId, { creds: authState.creds, keys: authState.keys })
  })

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      console.log(`[Baileys] QR generated for tenant ${tenantId}`)
      await storeQrCode(tenantId, qr)
    }

    if (qr === undefined && connection !== 'open') {
      await clearQrCode(tenantId)
    }

    if (connection === 'open') {
      entry.connected = true
      console.log(`[Baileys] Connected for tenant ${tenantId}`)
      await clearQrCode(tenantId)
    }

    if (connection === 'close') {
      entry.connected = false
      await releaseSocketLock(tenantId)
      const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut
      console.log(`[Baileys] Disconnected for tenant ${tenantId}, reconnecting: ${shouldReconnect}`)

      if (shouldReconnect) {
        setTimeout(() => {
          sockets.delete(tenantId)
          startBaileysSocket(tenantId)
        }, 1000)
      } else {
        await deleteBaileysAuthState(tenantId)
        sockets.delete(tenantId)
        console.log(`[Baileys] Logged out for tenant ${tenantId}, auth cleared`)
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
        // Emit status update event via outbox (transport projector will record to whatsapp_events)
        await emitWhatsAppStatusUpdated({
          billzoMessageId: null,
          invoiceId: null,
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
    entry.socket.end(undefined)
    sockets.delete(tenantId)
  }
}

export async function disconnectBaileys(tenantId: string): Promise<void> {
  await stopBaileysSocket(tenantId)
  await deleteBaileysAuthState(tenantId)
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
  const result = await sock.sendMessage(jid, {
    document: { url },
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
