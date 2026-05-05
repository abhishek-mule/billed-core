import { NextResponse } from 'next/server'

export function middleware() {
  const response = NextResponse.next()
  response.headers.set('x-tenant-id', 'tenant_billzo_demo_india')
  response.headers.set('x-user-id', 'merchant_demo_owner')
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
}
