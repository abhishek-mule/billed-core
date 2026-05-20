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

const otpStore = new Map<string, { hash: string; createdAt: number }>()
const sessionStore = new Map<string, Session>()

export async function setOtp(phone: string, hash: string): Promise<{ success: true } | { success: false; reason: string }> {
  const e164 = phone.startsWith('+') ? phone : `+${phone}`
  const recent = otpStore.get(e164)
  if (recent && Date.now() - recent.createdAt < OTP_RATE_LIMIT_MS) {
    return { success: false, reason: 'Please wait before requesting another OTP' }
  }
  otpStore.set(e164, { hash, createdAt: Date.now() })
  return { success: true }
}

export async function getOtp(phone: string) {
  const e164 = phone.startsWith('+') ? phone : `+${phone}`
  const entry = otpStore.get(e164)
  if (!entry) return null
  if (Date.now() - entry.createdAt > OTP_TTL_MS) {
    otpStore.delete(e164)
    return null
  }
  return entry
}

export async function deleteOtp(phone: string) {
  const e164 = phone.startsWith('+') ? phone : `+${phone}`
  otpStore.delete(e164)
}

export async function setSession(sessionId: string, session: Session): Promise<void> {
  sessionStore.set(sessionId, session)
}

export async function getSession(sessionId: string): Promise<Session | null> {
  return sessionStore.get(sessionId) ?? null
}

export async function deleteSession(sessionId: string): Promise<void> {
  sessionStore.delete(sessionId)
}

export async function findSessionsByUserId(userId: string): Promise<Session[]> {
  return Array.from(sessionStore.values()).filter(s => s.userId === userId)
}

export async function findSessionsByPhone(phone: string): Promise<Session[]> {
  const e164 = phone.startsWith('+') ? phone : `+${phone}`
  return Array.from(sessionStore.values()).filter(s => s.phone === e164)
}

export function cleanupExpiredSessions(): void {
  const maxAge = 30 * 24 * 60 * 60 * 1000
  const now = Date.now()
  for (const [id, session] of sessionStore.entries()) {
    if (now - session.createdAt > maxAge) {
      sessionStore.delete(id)
    }
  }
}

setInterval(cleanupExpiredSessions, 60 * 60 * 1000)