import { NextRequest, NextResponse } from 'next/server'

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production'
const ACCESS_COOKIE = 'bz_access'
const REFRESH_COOKIE = 'bz_refresh'

export function createAccessToken(payload: {
  sessionId: string
  userId: string
  tenantId?: string
  phone?: string
  email?: string
}): string {
  const now = Math.floor(Date.now() / 1000)
  const data = {
    ...payload,
    iat: now,
    exp: now + 3600,
    type: 'access',
  }
  const base64Payload = Buffer.from(JSON.stringify(data)).toString('base64url')
  const signature = require('crypto')
    .createHmac('sha256', JWT_SECRET)
    .update(base64Payload)
    .digest('base64url')
  return `${base64Payload}.${signature}`
}

export function createRefreshToken(payload: { sessionId: string; userId: string }): string {
  const now = Math.floor(Date.now() / 1000)
  const data = {
    ...payload,
    iat: now,
    exp: now + 30 * 24 * 3600,
    type: 'refresh',
  }
  const base64Payload = Buffer.from(JSON.stringify(data)).toString('base64url')
  const signature = require('crypto')
    .createHmac('sha256', JWT_SECRET)
    .update(base64Payload)
    .digest('base64url')
  return `${base64Payload}.${signature}`
}

export function verifyAccessToken(token: string): {
  sessionId: string
  userId: string
  tenantId?: string
  phone?: string
  email?: string
} | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 2) return null
    const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString())
    if (payload.type !== 'access') return null
    if (payload.exp < Math.floor(Date.now() / 1000)) return null
    const expectedSig = require('crypto')
      .createHmac('sha256', JWT_SECRET)
      .update(parts[0])
      .digest('base64url')
    if (expectedSig !== parts[1]) return null
    return {
      sessionId: payload.sessionId,
      userId: payload.userId,
      tenantId: payload.tenantId,
      phone: payload.phone,
      email: payload.email,
    }
  } catch {
    return null
  }
}

export function verifyRefreshToken(token: string): { sessionId: string; userId: string } | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 2) return null
    const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString())
    if (payload.type !== 'refresh') return null
    if (payload.exp < Math.floor(Date.now() / 1000)) return null
    const expectedSig = require('crypto')
      .createHmac('sha256', JWT_SECRET)
      .update(parts[0])
      .digest('base64url')
    if (expectedSig !== parts[1]) return null
    return { sessionId: payload.sessionId, userId: payload.userId }
  } catch {
    return null
  }
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
    sameSite: 'strict',
    maxAge: 3600,
    path: '/',
  })
  response.cookies.set(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'strict',
    maxAge: 30 * 24 * 3600,
    path: '/',
  })
  if (tenantId) {
    response.cookies.set('bz_tenant', tenantId, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'strict',
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

export { ACCESS_COOKIE, REFRESH_COOKIE }