import { createRedisClient } from './redis'

export interface Session {
  userId: string
  sessionId: string
  tenantId: string | null
  isPaid: boolean
  phone?: string
  email?: string
  createdAt: number
}

const OTP_TTL_SEC = 5 * 60
const SESSION_TTL_SEC = 30 * 24 * 60 * 60 // 30 days

function getRedis() {
  return createRedisClient()
}

export async function setOtp(phone: string, hash: string): Promise<{ success: true } | { success: false; reason: string }> {
  const e164 = phone.startsWith('+') ? phone : `+${phone}`
  const redis = getRedis()
  
  const key = `bz:otp:${e164}`
  const recent = await redis.get(key)
  if (recent) {
    const parsed = JSON.parse(recent)
    if (Date.now() - parsed.createdAt < 60 * 1000) {
      return { success: false, reason: 'Please wait before requesting another OTP' }
    }
  }
  
  await redis.set(key, JSON.stringify({ hash, createdAt: Date.now() }), 'EX', OTP_TTL_SEC)
  return { success: true }
}

export async function getOtp(phone: string) {
  const e164 = phone.startsWith('+') ? phone : `+${phone}`
  const redis = getRedis()
  const data = await redis.get(`bz:otp:${e164}`)
  if (!data) return null
  return JSON.parse(data)
}

export async function deleteOtp(phone: string) {
  const e164 = phone.startsWith('+') ? phone : `+${phone}`
  const redis = getRedis()
  await redis.del(`bz:otp:${e164}`)
}

export async function setSession(sessionId: string, session: Session): Promise<void> {
  const redis = getRedis()
  const sessionKey = `bz:session:${sessionId}`
  const userSessionsKey = `bz:user-sessions:${session.userId}`
  
  const multi = redis.multi()
    .set(sessionKey, JSON.stringify(session), 'EX', SESSION_TTL_SEC)
    .sadd(userSessionsKey, sessionId)
    .expire(userSessionsKey, SESSION_TTL_SEC)
  
  if (session.phone) {
    const e164 = session.phone.startsWith('+') ? session.phone : `+${session.phone}`
    const phoneSessionsKey = `bz:phone-sessions:${e164}`
    multi.sadd(phoneSessionsKey, sessionId).expire(phoneSessionsKey, SESSION_TTL_SEC)
  }
  
  await multi.exec()
}

export async function getSession(sessionId: string): Promise<Session | null> {
  const redis = getRedis()
  const data = await redis.get(`bz:session:${sessionId}`)
  if (!data) return null
  return JSON.parse(data)
}

export async function deleteSession(sessionId: string): Promise<void> {
  const redis = getRedis()
  const session = await getSession(sessionId)
  if (!session) return
  
  const sessionKey = `bz:session:${sessionId}`
  const userSessionsKey = `bz:user-sessions:${session.userId}`
  
  const multi = redis.multi()
    .del(sessionKey)
    .srem(userSessionsKey, sessionId)
  
  if (session.phone) {
    const e164 = session.phone.startsWith('+') ? session.phone : `+${session.phone}`
    multi.srem(`bz:phone-sessions:${e164}`, sessionId)
  }
  
  await multi.exec()
}

export async function findSessionsByUserId(userId: string): Promise<Session[]> {
  const redis = getRedis()
  const userSessionsKey = `bz:user-sessions:${userId}`
  const sessionIds = await redis.smembers(userSessionsKey)
  
  if (sessionIds.length === 0) return []
  
  const sessions: Session[] = []
  for (const sid of sessionIds) {
    const s = await getSession(sid)
    if (s) {
      sessions.push(s)
    } else {
      await redis.srem(userSessionsKey, sid)
    }
  }
  return sessions
}

export async function findSessionsByPhone(phone: string): Promise<Session[]> {
  const e164 = phone.startsWith('+') ? phone : `+${phone}`
  const redis = getRedis()
  const phoneSessionsKey = `bz:phone-sessions:${e164}`
  const sessionIds = await redis.smembers(phoneSessionsKey)
  
  if (sessionIds.length === 0) return []
  
  const sessions: Session[] = []
  for (const sid of sessionIds) {
    const s = await getSession(sid)
    if (s) {
      sessions.push(s)
    } else {
      await redis.srem(phoneSessionsKey, sid)
    }
  }
  return sessions
}

export function cleanupExpiredSessions(): void {
  // Handled by Redis TTL
}

// ── Magic Link Rate Limiting ──

export async function checkMagicLinkRateLimit(email: string, ip: string): Promise<{ allowed: boolean; reason?: string }> {
  const redis = getRedis()
  const emailKey = `bz:magic_link:email:${email}`
  const ipKey = `bz:magic_link:ip:${ip}`
  const cooldownKey = `bz:magic_link:cooldown:${email}`
  const dailyKey = `bz:magic_link:daily:${email}`
  const today = new Date().toISOString().slice(0, 10)

  // 60s cooldown
  const cooldown = await redis.get(cooldownKey)
  if (cooldown) return { allowed: false, reason: 'Please wait 60 seconds before requesting another link.' }

  // Hourly limit: 5/email
  const hourlyCount = await redis.get(emailKey)
  const hourly = hourlyCount ? parseInt(hourlyCount) : 0
  if (hourly >= 5) return { allowed: false, reason: 'Too many requests. Please try again later.' }

  // Daily limit: 20/email
  const dailyRaw = await redis.get(dailyKey)
  const daily = dailyRaw ? parseInt(dailyRaw) : 0
  if (daily >= 20) return { allowed: false, reason: 'Daily limit reached. Please try again tomorrow.' }

  // IP limit: 10/hr
  const ipCount = await redis.get(ipKey)
  const ipHits = ipCount ? parseInt(ipCount) : 0
  if (ipHits >= 10) return { allowed: false, reason: 'Too many requests from this device. Please try again later.' }

  return { allowed: true }
}

export async function incrementMagicLinkCounters(email: string, ip: string): Promise<void> {
  const redis = getRedis()
  const emailKey = `bz:magic_link:email:${email}`
  const ipKey = `bz:magic_link:ip:${ip}`
  const cooldownKey = `bz:magic_link:cooldown:${email}`
  const dailyKey = `bz:magic_link:daily:${email}`
  const today = new Date().toISOString().slice(0, 10)

  const multi = redis.multi()
    .incr(emailKey)
    .expire(emailKey, 3600)
    .incr(ipKey)
    .expire(ipKey, 3600)
    .set(cooldownKey, '1', 'EX', 60)
    .incr(dailyKey)
    .expire(dailyKey, 86400)

  await multi.exec()
}

// ── Generic Rate Limiter ──

export async function checkRateLimit(
  key: string,
  maxAttempts: number,
  windowSeconds: number,
): Promise<{ allowed: boolean; reason?: string }> {
  const redis = getRedis()
  const redisKey = `bz:ratelimit:${key}`
  const current = await redis.get(redisKey)
  const count = current ? parseInt(current) : 0
  if (count >= maxAttempts) {
    return { allowed: false, reason: 'Too many attempts. Please try again later.' }
  }
  return { allowed: true }
}

export async function incrementRateLimit(key: string, windowSeconds: number): Promise<void> {
  const redis = getRedis()
  const redisKey = `bz:ratelimit:${key}`
  const multi = redis.multi().incr(redisKey)
  multi.expire(redisKey, windowSeconds)
  await multi.exec()
}

export async function recordLoginEvent(params: {
  userId?: string
  email?: string
  ip?: string
  userAgent?: string
  success?: boolean
}): Promise<void> {
  try {
    const { createClient } = await import('@supabase/supabase-js')
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    if (!url || !key) return

    const supabase = createClient(url, key)
    await supabase.from('login_events').insert({
      user_id: params.userId || null,
      email: params.email || null,
      ip: params.ip || null,
      user_agent: params.userAgent || null,
      success: params.success ?? true,
    }).maybeSingle()
  } catch (err) {
    console.error('[recordLoginEvent] Failed to record event:', err)
  }
}