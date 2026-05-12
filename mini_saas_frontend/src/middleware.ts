import { NextRequest, NextResponse } from 'next/server'
import { getTokenFromRequest, getTenantFromRequest, verifyAccessToken } from '@/lib/billzo/auth-jwt'

export function middleware(request: NextRequest) {
  const response = NextResponse.next()
  const accessToken = getTokenFromRequest(request)
  const tenantId = getTenantFromRequest(request)

  if (accessToken) {
    const payload = verifyAccessToken(accessToken)
    if (payload) {
      response.headers.set('x-user-id', payload.userId)
      response.headers.set('x-tenant-id', payload.tenantId || tenantId || '')
      return response
    }
  }

  response.headers.set('x-user-id', '')
  response.headers.set('x-tenant-id', tenantId || '')
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*|api/auth).*)'],
}