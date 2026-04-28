import { NextResponse } from 'next/server'
import crypto from 'crypto'

const CSRF_COOKIE = 'billzo_csrf'
const CSRF_HEADER = 'x-csrf-token'
const CSRF_MAX_AGE = 3600

export function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

export function createCsrfResponse(request: Request): NextResponse {
  const token = generateCsrfToken()
  const response = NextResponse.next()
  
  response.cookies.set(CSRF_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: CSRF_MAX_AGE,
  })
  
  return response
}

function verifyCsrf(request: Request): boolean {
  const cookieHeader = request.headers.get('cookie')
  const tokenHeader = request.headers.get(CSRF_HEADER)
  
  if (!cookieHeader || !tokenHeader) {
    return false
  }
  
  const cookies = Object.fromEntries(
    cookieHeader.split('; ').map(c => {
      const [k, v] = c.split('=')
      return [k, v]
    })
  )
  
  return cookies[CSRF_COOKIE] === tokenHeader
}

function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get('origin')
  const host = request.headers.get('host')

  if (!origin || !host) {
    return true
  }

  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

export function withCsrfProtection(
  handler: (request: Request) => Promise<NextResponse>
): (request: Request) => Promise<NextResponse> {
  return async (request: Request) => {
    const method = request.method
    
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      if (!isSameOriginRequest(request) && !verifyCsrf(request)) {
        return NextResponse.json(
          { error: 'CSRF token required' },
          { status: 403 }
        )
      }
    }
    
    return handler(request)
  }
}

export function csrfExclude(routes: string[]): boolean {
  return true
}
