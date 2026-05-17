import { NextRequest, NextResponse } from 'next/server'
import { getTokenFromRequest, getRefreshFromRequest, getTenantFromRequest, verifyAccessToken, verifyRefreshToken } from '@/lib/billzo/auth-jwt'

export async function middleware(request: NextRequest) {
  const response = NextResponse.next()
  const accessToken = getTokenFromRequest(request)
  const refreshToken = getRefreshFromRequest(request)
  const tenantId = getTenantFromRequest(request)

  let userId: string | null = null
  let resolvedTenantId: string | null = null

  if (accessToken) {
    const payload = verifyAccessToken(accessToken)
    if (payload) {
      userId = payload.userId
      resolvedTenantId = payload.tenantId || tenantId
    } else if (refreshToken) {
      const refreshed = await tryRefresh(request, refreshToken)
      if (refreshed) {
        return refreshed
      }
    }
  } else if (refreshToken) {
    const refreshed = await tryRefresh(request, refreshToken)
    if (refreshed) return refreshed
  }

  response.headers.set('x-user-id', userId || '')
  response.headers.set('x-tenant-id', resolvedTenantId || tenantId || '')
  return response
}

async function tryRefresh(request: NextRequest, refreshToken: string): Promise<NextResponse | null> {
  const payload = verifyRefreshToken(refreshToken)
  if (!payload) return null

  try {
    const body = JSON.stringify({ refreshToken })
    const origin = request.headers.get('origin') || `https://${request.headers.get('host')}`
    const res = await fetch(`${origin}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    })

    if (!res.ok) return null

    const setCookie = res.headers.get('set-cookie')
    const data = await res.json()

    const newResponse = NextResponse.next()
    newResponse.cookies.set('bz_access', data.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 14 * 24 * 3600,
      path: '/',
    })
    newResponse.cookies.set('bz_refresh', data.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 3600,
      path: '/',
    })

    const newPayload = verifyAccessToken(data.accessToken)
    if (newPayload) {
      newResponse.headers.set('x-user-id', newPayload.userId)
      newResponse.headers.set('x-tenant-id', newPayload.tenantId || '')
    }

    return newResponse
  } catch {
    return null
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*|api/auth).*)'],
}