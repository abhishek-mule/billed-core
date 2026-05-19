import { NextRequest, NextResponse } from 'next/server'
import { getTokenFromRequest, getRefreshFromRequest, getTenantFromRequest, verifyAccessToken, verifyRefreshToken } from '@/lib/billzo/auth-jwt'

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname
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
        return applyRoutingRules(refreshed, pathname, true, true)
      }
    }
  } else if (refreshToken) {
    const refreshed = await tryRefresh(request, refreshToken)
    if (refreshed) return applyRoutingRules(refreshed, pathname, true, true)
  }

  const response = NextResponse.next()
  response.headers.set('x-user-id', userId || '')
  response.headers.set('x-tenant-id', resolvedTenantId || tenantId || '')

  return applyRoutingRules(response, pathname, !!userId, !!resolvedTenantId)
}

function applyRoutingRules(response: NextResponse, pathname: string, hasAuth: boolean, hasTenant: boolean): NextResponse {
  const isAuthRoute = pathname.startsWith('/auth')
  const isOnboardingRoute = pathname.startsWith('/onboarding')
  const isAppRoute = pathname.startsWith('/dashboard') || pathname.startsWith('/invoices') || pathname.startsWith('/parties') || pathname.startsWith('/settings') || pathname.startsWith('/reports') || pathname.startsWith('/pos') || pathname.startsWith('/scan') || pathname.startsWith('/pricing')

  if (!hasAuth && isAppRoute) {
    return NextResponse.redirect(new URL('/auth', response.url))
  }

  if (hasAuth && isAuthRoute) {
    return NextResponse.redirect(new URL('/dashboard', response.url))
  }

  if (hasAuth && !hasTenant && !isOnboardingRoute && pathname !== '/') {
    return NextResponse.redirect(new URL('/onboarding', response.url))
  }

  if (hasAuth && hasTenant && isOnboardingRoute) {
    return NextResponse.redirect(new URL('/dashboard', response.url))
  }

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
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*|api/auth|api/events).*)'],
}