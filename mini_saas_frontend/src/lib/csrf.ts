import crypto from 'crypto'

const CSRF_COOKIE = 'billzo_csrf'
const CSRF_HEADER = 'x-csrf-token'

export function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

export function createCsrfResponse(response: any): any {
  const token = generateCsrfToken()
  response.cookies.set(CSRF_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 3600,
  })
  response.headers.set(CSRF_COOKIE, token)
  return response
}

export function verifyCsrf(request: Request): boolean {
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
  
  const cookieToken = cookies[CSRF_COOKIE]
  const headerToken = tokenHeader
  
  return cookieToken === headerToken
}

export function withCsrfProtection(
  handler: (request: Request, ...args: any[]) => Promise<any>
): (request: Request, ...args: any[]) => Promise<any> {
  return async (request: Request, ...args: any[]) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
      if (!verifyCsrf(request)) {
        return new Response(JSON.stringify({ error: 'CSRF token required' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    }
    return handler(request, ...args)
  }
}