import { NextRequest, NextResponse } from 'next/server'
import { getTokenFromRequest, getRefreshFromRequest, getTenantFromRequest, verifyAccessTokenEdge, verifyRefreshTokenEdge } from '@/lib/billzo/auth-jwt'

const DEBUG = process.env.BILLZO_MW_DEBUG === '1'

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const accessToken = getTokenFromRequest(request)
  const refreshToken = getRefreshFromRequest(request)
  const tenantId = getTenantFromRequest(request)

  if (DEBUG) {
    console.log(`[Middleware] Path: ${pathname}, hasAccessToken: ${!!accessToken}, hasRefreshToken: ${!!refreshToken}, hasTenantCookie: ${!!tenantId}`)
  }

  let userId: string | null = null
  let resolvedTenantId: string | null = null

  if (accessToken) {
    const payload = await verifyAccessTokenEdge(accessToken)
    if (DEBUG) {
      console.log(`[Middleware] verifyAccessToken result: ${payload ? `userId=${payload.userId}` : 'INVALID'}`)
    }
    if (payload) {
      userId = payload.userId
      resolvedTenantId = payload.tenantId || tenantId
    } else if (refreshToken) {
      const refreshed = await tryRefresh(request, refreshToken)
      if (refreshed) {
        return applyRoutingRules(refreshed, pathname, true, true, request.url)
      }
    }
  } else if (refreshToken) {
    const refreshed = await tryRefresh(request, refreshToken)
    if (refreshed) return applyRoutingRules(refreshed, pathname, true, true, request.url)
  }

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-user-id', userId || '')
  requestHeaders.set('x-tenant-id', resolvedTenantId || tenantId || '')

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  })

  return applyRoutingRules(response, pathname, !!userId, !!resolvedTenantId, request.url)
}

function applyRoutingRules(response: NextResponse, pathname: string, hasAuth: boolean, hasTenant: boolean, requestUrl: string): NextResponse {
  const isAuthRoute = pathname.startsWith('/auth')
  const isAuthResolverRoute = pathname.startsWith('/auth/resolve')
  const isOnboardingRoute = pathname.startsWith('/onboarding')
  const isAppRoute = pathname.startsWith('/dashboard') || pathname.startsWith('/sales') || pathname.startsWith('/udhar') || pathname.startsWith('/invoices') || pathname.startsWith('/parties') || pathname.startsWith('/settings') || pathname.startsWith('/reports') || pathname.startsWith('/pos') || pathname.startsWith('/pricing') || pathname.startsWith('/more') || pathname.startsWith('/pulse') || pathname.startsWith('/cashflow') || pathname.startsWith('/products') || pathname.startsWith('/purchases') || pathname.startsWith('/recovery')

  if (DEBUG) {
    console.log(`[Middleware] Routing: path=${pathname}, hasAuth=${hasAuth}, hasTenant=${hasTenant}, isAuth=${isAuthRoute}, isAuthResolver=${isAuthResolverRoute}, isOnboarding=${isOnboardingRoute}, isApp=${isAppRoute}`)
  }

  if (!hasAuth && isAppRoute) {
    if (DEBUG) console.log(`[Middleware] Redirecting to /auth (no auth, app route)`)
    return NextResponse.redirect(new URL('/auth', requestUrl))
  }

  if (hasAuth && isAuthRoute && !isAuthResolverRoute) {
    const destination = hasTenant ? '/dashboard' : '/onboarding'
    if (DEBUG) console.log(`[Middleware] Redirecting to ${destination} (auth, auth route)`)
    return NextResponse.redirect(new URL(destination, requestUrl))
  }

  if (hasAuth && !hasTenant && !isOnboardingRoute && !isAuthResolverRoute && pathname !== '/') {
    if (DEBUG) console.log(`[Middleware] Redirecting to /onboarding (auth, no tenant)`)
    return NextResponse.redirect(new URL('/onboarding', requestUrl))
  }

  if (hasAuth && hasTenant && isOnboardingRoute) {
    if (DEBUG) console.log(`[Middleware] Redirecting to /dashboard (auth, has tenant, onboarding)`)
    return NextResponse.redirect(new URL('/dashboard', requestUrl))
  }

  if (DEBUG) console.log(`[Middleware] Allowing request`)
  return response
}

async function tryRefresh(request: NextRequest, refreshToken: string): Promise<NextResponse | null> {
  const payload = await verifyRefreshTokenEdge(refreshToken)
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

    const newPayload = await verifyAccessTokenEdge(data.accessToken)
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
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*|api/auth|api/events|api/tenants|api/merchants|auth/callback).*)'],
}
