import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'

const SESSION_COOKIE = 'billzo_session'

const publicPaths = [
  '/login',
  '/api/auth/',
  '/api/health',
  '/invoice/',
  '/api/print/',
]

function isPublicPath(pathname: string): boolean {
  return publicPaths.some(path => 
    pathname.startsWith(path)
  )
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (isPublicPath(pathname)) {
    return NextResponse.next()
  }

  const sessionCookie = req.cookies.get(SESSION_COOKIE)
  
  if (!sessionCookie) {
    return handleUnauthorized(req, pathname)
  }

  try {
    const session = await getSession(sessionCookie.value)

    if (!session) {
      return handleUnauthorized(req, pathname)
    }

    const requestHeaders = new Headers(req.headers)
    requestHeaders.set('x-tenant-id', session.tenantId)
    requestHeaders.set('x-user-id', session.userId)
    requestHeaders.set('x-role', session.role)

    return NextResponse.next({
      request: { headers: requestHeaders },
    })

  } catch (error) {
    console.error('[Middleware] Session validation error:', error)
    return handleUnauthorized(req, pathname)
  }
}

function handleUnauthorized(req: NextRequest, pathname: string): NextResponse {
  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Session expired or invalid' },
      { status: 401 }
    )
  }

  const loginUrl = new URL('/login', req.url)
  loginUrl.searchParams.set('redirect', pathname)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)',
  ],
}