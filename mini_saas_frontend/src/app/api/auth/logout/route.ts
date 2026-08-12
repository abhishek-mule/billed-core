import { NextRequest, NextResponse } from 'next/server'
import { getAuthPayloadFromRequest, ACCESS_COOKIE, REFRESH_COOKIE } from '@/lib/billzo/auth-jwt'
import { deleteSession } from '@/lib/billzo/auth-store'

export const dynamic = 'force-dynamic'

/**
 * Server-side logout. The auth cookies (bz_access / bz_refresh) are httpOnly
 * and cannot be cleared from client JavaScript, so a client-only logout leaves
 * a stale session behind — the middleware would then bounce /auth to
 * /onboarding (or /recovery) instead of showing the login page. This route
 * revokes the server-side session and deletes every auth cookie from the
 * response so the next navigation lands on login.
 */
export async function POST(request: NextRequest) {
  // Best-effort session revocation so the refresh token can't be re-used.
  const payload = getAuthPayloadFromRequest(request)
  if (payload?.sessionId) {
    try {
      await deleteSession(payload.sessionId)
    } catch {
      console.warn('[Logout] Could not revoke server session', payload.sessionId)
    }
  }

  const isProd = process.env.NODE_ENV === 'production'
  const response = NextResponse.json({ success: true })

  response.cookies.set(ACCESS_COOKIE, '', { httpOnly: true, secure: isProd, sameSite: 'lax', maxAge: 0, path: '/' })
  response.cookies.set(REFRESH_COOKIE, '', { httpOnly: true, secure: isProd, sameSite: 'lax', maxAge: 0, path: '/' })
  response.cookies.set('bz_tenant', '', { secure: isProd, sameSite: 'lax', maxAge: 0, path: '/' })
  response.cookies.set('bz_tenant_name', '', { secure: isProd, sameSite: 'lax', maxAge: 0, path: '/' })
  response.cookies.set('bz_user_id', '', { secure: isProd, sameSite: 'lax', maxAge: 0, path: '/' })

  return response
}