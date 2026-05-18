import { db, uuid } from './db'

export interface Session {
  userId: string
  sessionId: string
  tenantId: string | null
  isPaid: boolean
  phone?: string
  email?: string
  createdAt: number
}

const OTP_TTL_MS = 5 * 60 * 1000
const OTP_RATE_LIMIT_MS = 60 * 1000

export async function getOtpStore() {
  const database = db()
  await database.open()
  return database.otps
}

export async function setOtp(phone: string, hash: string): Promise<{ success: true } | { success: false; reason: string }> {
  const database = db()
  await database.open()
  const otps = database.otps
  const e164 = phone.startsWith('+') ? phone : `+${phone}`
  const recent = await otps.where('phone').equals(e164).reverse().sortBy('createdAt')
  if (recent.length > 0 && Date.now() - recent[0].createdAt < OTP_RATE_LIMIT_MS) {
    return { success: false, reason: 'Please wait before requesting another OTP' }
  }
  await otps.add({ id: uuid(), phone: e164, hash, createdAt: Date.now() })
  return { success: true }
}

export async function getOtp(phone: string) {
  const database = db()
  await database.open()
  const e164 = phone.startsWith('+') ? phone : `+${phone}`
  const candidates = await database.otps.where('phone').equals(e164).reverse().sortBy('createdAt')
  const entry = candidates.find(e => Date.now() - e.createdAt < OTP_TTL_MS)
  return entry ?? null
}

export async function deleteOtp(phone: string) {
  const database = db()
  await database.open()
  const e164 = phone.startsWith('+') ? phone : `+${phone}`
  const candidates = await database.otps.where('phone').equals(e164).toArray()
  await database.otps.bulkDelete(candidates.map(c => c.id))
}

export async function setSession(sessionId: string, session: Session): Promise<void> {
  const database = db()
  await database.open()
  const existing = await database.sessions.where('sessionId').equals(sessionId).first()
  if (existing) {
    await database.sessions.update(existing.id, { ...session, createdAt: session.createdAt || Date.now() })
  } else {
    await database.sessions.add({ ...session, sessionId, id: `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` })
  }
}

export async function getSession(sessionId: string): Promise<Session | null> {
  const database = db()
  await database.open()
  const entry = await database.sessions.where('sessionId').equals(sessionId).first()
  return entry ?? null
}

export async function deleteSession(sessionId: string): Promise<void> {
  const database = db()
  await database.open()
  const candidates = await database.sessions.where('sessionId').equals(sessionId).toArray()
  await database.sessions.bulkDelete(candidates.map(c => c.id))
}

export async function findSessionsByUserId(userId: string): Promise<Session[]> {
  const database = db()
  await database.open()
  return database.sessions.where('userId').equals(userId).toArray()
}

export async function findSessionsByPhone(phone: string): Promise<Session[]> {
  const database = db()
  await database.open()
  const e164 = phone.startsWith('+') ? phone : `+${phone}`
  return database.sessions.where('phone').equals(e164).toArray()
}