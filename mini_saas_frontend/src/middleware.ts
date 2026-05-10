import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/billzo/db'
import { getActiveSession } from '@/lib/billzo/tenant'

export function middleware(request: NextRequest) {
  const response = NextResponse.next()

  const session = getActiveSession()

  response.headers.set('x-tenant-id', session.tenantId)
  response.headers.set('x-user-id', session.userId)

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
}
