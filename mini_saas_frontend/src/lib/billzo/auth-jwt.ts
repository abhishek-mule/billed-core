import { NextRequest, NextResponse } from 'next/server'

/**
 * JWT_SECRET is read lazily so server restart without env var is caught
 * at first token operation, not at module-parse time.
 */
function requireSecret(): string {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET
  throw new Error('[BillZo] JWT_SECRET env var is required')
}

const HEADER_B64 = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')

const ACCESS_COOKIE = 'bz_access'
const REFRESH_COOKIE = 'bz_refresh'

/** Create an HMAC-SHA256 signature for the signing input. */
function sign(input: string): string {
  return require('crypto')
    .createHmac('sha256', requireSecret())
    .update(input)
    .digest('base64url')
}

/** Produce a standard 3‑segment JWT: header.payload.signature */
function encodeJwt(payload: Record<string, unknown>): string {
  const b64Payload = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = sign(`${HEADER_B64}.${b64Payload}`)
  return `${HEADER_B64}.${b64Payload}.${sig}`
}

/**
 * Verify a JWT that may be either the legacy 2‑segment format
 * (base64(payload).signature) or the standard 3‑segment format
 * (header.payload.signature).
 */
function verifyToken<T>(token: string, expectedType: string): T | null {
  try {
    const parts = token.split('.')
    if (parts.length === 2) {
      // ── Legacy 2‑segment format ──
      const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString())
      if (payload.type !== expectedType) return null
      if (payload.exp < Math.floor(Date.now() / 1000)) return null
      const expectedSig = sign(parts[0])
      if (expectedSig !== parts[1]) return null
      return payload as T
    }
    if (parts.length === 3) {
      // ── Standard 3‑segment format ──
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString())
      if (payload.type !== expectedType) return null
      if (payload.exp < Math.floor(Date.now() / 1000)) return null
      const expectedSig = sign(`${parts[0]}.${parts[1]}`)
      if (expectedSig !== parts[2]) return null
      return payload as T
    }
    return null
  } catch {
    return null
  }
}

// ── Token creation (always produces standard 3‑segment JWTs) ──────────────

export function createAccessToken(payload: {
  sessionId: string
  userId: string
  tenantId?: string
  phone?: string
  email?: string
}): string {
  const now = Math.floor(Date.now() / 1000)
  return encodeJwt({
    ...payload,
    iat: now,
    exp: now + 14 * 24 * 3600,
    type: 'access',
  })
}

export function createRefreshToken(payload: { sessionId: string; userId: string }): string {
  const now = Math.floor(Date.now() / 1000)
  return encodeJwt({
    ...payload,
    iat: now,
    exp: now + 30 * 24 * 3600,
    type: 'refresh',
  })
}

// ── Server‑side verify (Node.js Buffer) ──────────────────────────────────

export function verifyAccessToken(token: string): {
  sessionId: string
  userId: string
  tenantId?: string
  phone?: string
  email?: string
} | null {
  return verifyToken(token, 'access')
}

export function verifyRefreshToken(token: string): { sessionId: string; userId: string } | null {
  return verifyToken(token, 'refresh')
}

// ── Edge‑runtime helpers (WebCrypto + atob) ──────────────────────────────

async function signEdge(input: string): Promise<string | null> {
  try {
    const secret = new TextEncoder().encode(requireSecret())
    const key = await crypto.subtle.importKey(
      'raw',
      secret,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(input))
    return uint8ArrayToBase64Url(new Uint8Array(sig))
  } catch {
    return null
  }
}

function decodeBase64UrlJson<T>(value: string): T | null {
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
    return JSON.parse(atob(padded)) as T
  } catch {
    return null
  }
}

function uint8ArrayToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

async function verifyTokenEdge<T>(token: string, expectedType: string): Promise<T | null> {
  try {
    const parts = token.split('.')
    if (parts.length === 2) {
      // ── Legacy 2‑segment format ──
      const payload = decodeBase64UrlJson<any>(parts[0])
      if (!payload || payload.type !== expectedType) return null
      if (payload.exp < Math.floor(Date.now() / 1000)) return null
      const expectedSig = await signEdge(parts[0])
      if (!expectedSig || expectedSig !== parts[1]) return null
      return payload as T
    }
    if (parts.length === 3) {
      // ── Standard 3‑segment format ──
      const payload = decodeBase64UrlJson<any>(parts[1])
      if (!payload || payload.type !== expectedType) return null
      if (payload.exp < Math.floor(Date.now() / 1000)) return null
      const expectedSig = await signEdge(`${parts[0]}.${parts[1]}`)
      if (!expectedSig || expectedSig !== parts[2]) return null
      return payload as T
    }
    return null
  } catch {
    return null
  }
}

export async function verifyAccessTokenEdge(token: string): Promise<{
  sessionId: string
  userId: string
  tenantId?: string
  phone?: string
  email?: string
} | null> {
  return verifyTokenEdge(token, 'access')
}

export async function verifyRefreshTokenEdge(token: string): Promise<{ sessionId: string; userId: string } | null> {
  return verifyTokenEdge(token, 'refresh')
}

export function setAuthCookies(
  response: NextResponse,
  accessToken: string,
  refreshToken: string,
  tenantId?: string,
  tenantName?: string
) {
  const isProd = process.env.NODE_ENV === 'production'
  response.cookies.set(ACCESS_COOKIE, accessToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    maxAge: 14 * 24 * 3600,
    path: '/',
  })
  response.cookies.set(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    maxAge: 30 * 24 * 3600,
    path: '/',
  })
  if (tenantId) {
    response.cookies.set('bz_tenant', tenantId, {
      httpOnly: false,
      secure: isProd,
      sameSite: 'lax',
      maxAge: 30 * 24 * 3600,
      path: '/',
    })
    response.cookies.set('bz_tenant_name', tenantName || '', {
      httpOnly: false,
      secure: isProd,
      sameSite: 'lax',
      maxAge: 30 * 24 * 3600,
      path: '/',
    })
  }
}

export function clearAuthCookies(response: NextResponse) {
  response.cookies.delete(ACCESS_COOKIE)
  response.cookies.delete(REFRESH_COOKIE)
  response.cookies.delete('bz_tenant')
  response.cookies.delete('bz_tenant_name')
}

export function getTokenFromRequest(request: NextRequest): string | null {
  return request.cookies.get(ACCESS_COOKIE)?.value || null
}

export function getRefreshFromRequest(request: NextRequest): string | null {
  return request.cookies.get(REFRESH_COOKIE)?.value || null
}

export function getTenantFromRequest(request: NextRequest): string | null {
  return request.cookies.get('bz_tenant')?.value || null
}

export function getAuthPayloadFromRequest(request: NextRequest): {
  sessionId: string
  userId: string
  tenantId?: string
  phone?: string
  email?: string
} | null {
  const token = getTokenFromRequest(request)
  if (!token) return null
  return verifyAccessToken(token)
}

export function getVerifiedTenantIdFromRequest(request: NextRequest): string | null {
  const payload = getAuthPayloadFromRequest(request)
  if (!payload) return null

  // Cross-check: ensure JWT tenantId matches the non-httpOnly cookie if both are set
  const cookieTenantId = request.cookies.get('bz_tenant')?.value
  if (payload.tenantId && cookieTenantId && payload.tenantId !== cookieTenantId) return null

  return payload.tenantId || cookieTenantId || null
}

export function getVerifiedUserIdFromRequest(request: NextRequest): string | null {
  const payload = getAuthPayloadFromRequest(request)
  if (!payload) return null
  return payload.userId || null
}

export { ACCESS_COOKIE, REFRESH_COOKIE }
