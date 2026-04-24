import { headers } from 'next/headers'

export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
}

export function getRequestId(): string | null {
  try {
    const headersList = headers()
    return headersList.get('x-request-id')
  } catch {
    return null
  }
}

export function createContext(request: Request): {
  requestId: string
  tenantId?: string
  userId?: string
  ip?: string
  userAgent?: string
} {
  const requestId = request.headers.get('x-request-id') || generateRequestId()
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() 
    || request.headers.get('x-real-ip') 
    || 'unknown'
  const userAgent = request.headers.get('user-agent') || ''
  
  return {
    requestId,
    ip,
    userAgent,
  }
}

export async function withCorrelation(
  handler: (request: Request, ctx: ReturnType<typeof createContext>) => Promise<Response>
): Promise<(request: Request) => Promise<Response>> {
  return async (request: Request) => {
    const ctx = createContext(request)
    
    try {
      return await handler(request, ctx)
    } catch (error) {
      console.error(`[${ctx.requestId}] Unhandled error:`, error)
      throw error
    }
  }
}