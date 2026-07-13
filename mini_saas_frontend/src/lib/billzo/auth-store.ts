import { supabaseAdmin } from './supabase-admin'

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

function now(): string {
  return new Date().toISOString()
}

function expiresAt(ttlSec: number): string {
  return new Date(Date.now() + ttlSec * 1000).toISOString()
}

function isExpired(expiresAt: string | null): boolean {
  return expiresAt ? new Date(expiresAt).getTime() < Date.now() : false
}

// ── OTP ──

export async function setOtp(phone: string, hash: string): Promise<{ success: true } | { success: false; reason: string }> {
  const e164 = phone.startsWith('+') ? phone : `+${phone}`
  const key = `bz:otp:${e164}`

  const { data: existing } = await supabaseAdmin
    .from('kv_store')
    .select('value')
    .eq('key', key)
    .gte('expires_at', now())
    .maybeSingle()

  if (existing) {
    const parsed = existing.value as { hash: string; createdAt: number }
    if (Date.now() - parsed.createdAt < 60 * 1000) {
      return { success: false, reason: 'Please wait before requesting another OTP' }
    }
  }

  const { error } = await supabaseAdmin
    .from('kv_store')
    .upsert({
      key,
      value: { hash, createdAt: Date.now() },
      expires_at: expiresAt(OTP_TTL_SEC),
      updated_at: now(),
    }, { onConflict: 'key' })

  if (error) {
    console.error('[setOtp] Upsert error:', error)
    return { success: false, reason: 'Failed to store OTP' }
  }
  return { success: true }
}

export async function getOtp(phone: string) {
  const e164 = phone.startsWith('+') ? phone : `+${phone}`
  const key = `bz:otp:${e164}`

  const { data } = await supabaseAdmin
    .from('kv_store')
    .select('value, expires_at')
    .eq('key', key)
    .maybeSingle()

  if (!data || isExpired(data.expires_at)) {
    if (data) await supabaseAdmin.from('kv_store').delete().eq('key', key)
    return null
  }
  return data.value as { hash: string; createdAt: number }
}

export async function deleteOtp(phone: string) {
  const e164 = phone.startsWith('+') ? phone : `+${phone}`
  await supabaseAdmin
    .from('kv_store')
    .delete()
    .eq('key', `bz:otp:${e164}`)
}

// ── Sessions ──

export async function setSession(sessionId: string, session: Session): Promise<void> {
  const { error } = await supabaseAdmin
    .from('sessions')
    .upsert({
      id: sessionId,
      user_id: session.userId,
      tenant_id: session.tenantId,
      is_paid: session.isPaid,
      phone: session.phone || null,
      email: session.email || null,
      data: { createdAt: session.createdAt },
      expires_at: expiresAt(SESSION_TTL_SEC),
    }, { onConflict: 'id' })

  if (error) console.error('[setSession] Upsert error:', error)
}

export async function getSession(sessionId: string): Promise<Session | null> {
  const { data } = await supabaseAdmin
    .from('sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle()

  if (!data || isExpired(data.expires_at)) {
    if (data) await supabaseAdmin.from('sessions').delete().eq('id', sessionId)
    return null
  }

  return {
    userId: data.user_id,
    sessionId: data.id,
    tenantId: data.tenant_id,
    isPaid: data.is_paid,
    phone: data.phone || undefined,
    email: data.email || undefined,
    createdAt: (data.data as any)?.createdAt || Date.parse(data.created_at),
  }
}

export async function deleteSession(sessionId: string): Promise<void> {
  await supabaseAdmin
    .from('sessions')
    .delete()
    .eq('id', sessionId)
}

export async function findSessionsByUserId(userId: string): Promise<Session[]> {
  const { data } = await supabaseAdmin
    .from('sessions')
    .select('*')
    .eq('user_id', userId)
    .gte('expires_at', now())

  if (!data) return []

  return data.map(row => ({
    userId: row.user_id,
    sessionId: row.id,
    tenantId: row.tenant_id,
    isPaid: row.is_paid,
    phone: row.phone || undefined,
    email: row.email || undefined,
    createdAt: (row.data as any)?.createdAt || Date.parse(row.created_at),
  }))
}

export async function findSessionsByPhone(phone: string): Promise<Session[]> {
  const e164 = phone.startsWith('+') ? phone : `+${phone}`

  const { data } = await supabaseAdmin
    .from('sessions')
    .select('*')
    .eq('phone', e164)
    .gte('expires_at', now())

  if (!data) return []

  return data.map(row => ({
    userId: row.user_id,
    sessionId: row.id,
    tenantId: row.tenant_id,
    isPaid: row.is_paid,
    phone: row.phone || undefined,
    email: row.email || undefined,
    createdAt: (row.data as any)?.createdAt || Date.parse(row.created_at),
  }))
}

export function cleanupExpiredSessions(): void {
  // Handled by the cleanup_expired_store() Postgres function
}

// ── Magic Link Rate Limiting ──

export async function checkMagicLinkRateLimit(email: string, ip: string): Promise<{ allowed: boolean; reason?: string }> {
  const cooldownKey = `bz:magic_link:cooldown:${email}`
  const emailKey = `bz:magic_link:email:${email}`
  const dailyKey = `bz:magic_link:daily:${email}`
  const ipKey = `bz:magic_link:ip:${ip}`

  const { data: rows } = await supabaseAdmin
    .from('kv_store')
    .select('key, value, expires_at')
    .in('key', [cooldownKey, emailKey, dailyKey, ipKey])
    .gte('expires_at', now())

  const map = new Map(rows?.map(r => [r.key, r]) || [])

  if (map.has(cooldownKey)) {
    return { allowed: false, reason: 'Please wait 60 seconds before requesting another link.' }
  }

  const hourly = (map.get(emailKey)?.value as any)?.count || 0
  if (hourly >= 5) return { allowed: false, reason: 'Too many requests. Please try again later.' }

  const daily = (map.get(dailyKey)?.value as any)?.count || 0
  if (daily >= 20) return { allowed: false, reason: 'Daily limit reached. Please try again tomorrow.' }

  const ipHits = (map.get(ipKey)?.value as any)?.count || 0
  if (ipHits >= 10) return { allowed: false, reason: 'Too many requests from this device. Please try again later.' }

  return { allowed: true }
}

async function incrementKvCounter(key: string, ttlSec: number): Promise<void> {
  const { data: existing } = await supabaseAdmin
    .from('kv_store')
    .select('value, expires_at')
    .eq('key', key)
    .maybeSingle()

  const count = existing && !isExpired(existing.expires_at)
    ? ((existing.value as any)?.count || 0) + 1
    : 1

  await supabaseAdmin
    .from('kv_store')
    .upsert({
      key,
      value: { count },
      expires_at: expiresAt(ttlSec),
      updated_at: now(),
    }, { onConflict: 'key' })
}

export async function incrementMagicLinkCounters(email: string, ip: string): Promise<void> {
  await Promise.all([
    incrementKvCounter(`bz:magic_link:email:${email}`, 3600),
    incrementKvCounter(`bz:magic_link:ip:${ip}`, 3600),
    incrementKvCounter(`bz:magic_link:daily:${email}`, 86400),
    supabaseAdmin.from('kv_store').upsert({
      key: `bz:magic_link:cooldown:${email}`,
      value: { count: 1 },
      expires_at: expiresAt(60),
      updated_at: now(),
    }, { onConflict: 'key' }),
  ])
}

// ── Generic Rate Limiter ──

export async function checkRateLimit(
  key: string,
  maxAttempts: number,
  windowSeconds: number,
): Promise<{ allowed: boolean; reason?: string }> {
  const redisKey = `bz:ratelimit:${key}`

  const { data } = await supabaseAdmin
    .from('kv_store')
    .select('value, expires_at')
    .eq('key', redisKey)
    .maybeSingle()

  const count = data && !isExpired(data.expires_at)
    ? ((data.value as any)?.count || 0)
    : 0

  if (count >= maxAttempts) {
    return { allowed: false, reason: 'Too many attempts. Please try again later.' }
  }
  return { allowed: true }
}

export async function incrementRateLimit(key: string, windowSeconds: number): Promise<void> {
  await incrementKvCounter(`bz:ratelimit:${key}`, windowSeconds)
}

export async function recordLoginEvent(params: {
  userId?: string
  email?: string
  ip?: string
  userAgent?: string
  success?: boolean
}): Promise<void> {
  try {
    await supabaseAdmin.from('login_events').insert({
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
