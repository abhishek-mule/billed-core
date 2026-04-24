import { NextResponse } from 'next/server'
import crypto from 'crypto'

const SESSION_COOKIE = 'billzo_session'
const SESSION_MAX_AGE = 15 * 60
const REFRESH_MAX_AGE = 7 * 24 * 60 * 60
const SECRET_KEY = 'billzo_secret_' + (process.env.SESSION_SECRET || 'dev-change-in-prod')

export interface SessionData {
  id: string
  tenantId: string
  userId: string
  role: 'owner' | 'cashier' | 'accountant'
  companyName: string
  plan: string
  createdAt: number
  expiresAt: number
  refreshUntil: number
  rotatedFrom?: string
}

interface TenantCredentials {
  tenantId: string
  erpSite: string
  apiKey: string
  apiSecret: string
  companyName: string
}

let redis: any = null

async function getRedis() {
  if (redis) return redis
  
  try {
    const { Redis } = await import('@upstash/redis')
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
    return redis
  } catch {
    return null
  }
}

const memorySessions = new Map<string, SessionData>()
const memoryCredentials = new Map<string, TenantCredentials>()

function generateSessionId(): string {
  return crypto.randomBytes(32).toString('hex')
}

export function generateCredentialId(): string {
  return crypto.randomBytes(16).toString('hex')
}

async function getTenantCredentials(tenantId: string): Promise<TenantCredentials | null> {
  const r = await getRedis()
  if (r) {
    const creds = await r.get(`tenant:${tenantId}`)
    if (creds) return creds as TenantCredentials
    return null
  }
  return memoryCredentials.get(tenantId) || null
}

export async function setTenantCredentials(tenantId: string, creds: Omit<TenantCredentials, 'tenantId'>): Promise<void> {
  const credentials: TenantCredentials = { tenantId, ...creds }
  const r = await getRedis()
  if (r) {
    await r.set(`tenant:${tenantId}`, JSON.stringify(credentials))
  } else {
    memoryCredentials.set(tenantId, credentials)
  }
}

export async function getSession(id: string): Promise<SessionData | null> {
  const r = await getRedis()
  let session: SessionData | null
  
  if (r) {
    const stored = await r.get(`session:${id}`)
    if (!stored) return null
    session = stored as SessionData
  } else {
    session = memorySessions.get(id) || null
  }
  
  if (!session) return null
  
  if (Date.now() > session.expiresAt) {
    await invalidateSession(id)
    return null
  }
  
  return session
}

export async function refreshSession(oldId: string): Promise<SessionData | null> {
  const oldSession = await getSession(oldId)
  if (!oldSession) return null
  
  if (Date.now() > oldSession.refreshUntil) {
    await invalidateSession(oldId)
    return null
  }
  
  await invalidateSession(oldId)
  
  const now = Date.now()
  const newSession: SessionData = {
    ...oldSession,
    id: generateSessionId(),
    createdAt: now,
    expiresAt: now + SESSION_MAX_AGE * 1000,
    refreshUntil: oldSession.refreshUntil,
    rotatedFrom: oldId,
  }
  
  const r = await getRedis()
  if (r) {
    await r.set(`session:${newSession.id}`, JSON.stringify(newSession), { ex: REFRESH_MAX_AGE })
  } else {
    memorySessions.set(newSession.id, newSession)
  }
  
  return newSession
}

export async function createSession(data: Omit<SessionData, 'id' | 'createdAt' | 'expiresAt' | 'refreshUntil'>): Promise<SessionData> {
  const now = Date.now()
  const session: SessionData = {
    ...data,
    id: generateSessionId(),
    createdAt: now,
    expiresAt: now + SESSION_MAX_AGE * 1000,
    refreshUntil: now + REFRESH_MAX_AGE * 1000,
  }
  
  const r = await getRedis()
  if (r) {
    await r.set(`session:${session.id}`, JSON.stringify(session), { ex: REFRESH_MAX_AGE })
  } else {
    memorySessions.set(session.id, session)
  }
  
  return session
}

export async function invalidateSession(id: string): Promise<void> {
  const r = await getRedis()
  if (r) {
    await r.del(`session:${id}`)
    const rotation = await r.get(`session:${id}`)
    if (rotation) await r.del(`session:${id}`)
  } else {
    memorySessions.delete(id)
  }
}

export async function getSessionFromRequest(request: Request): Promise<SessionData | null> {
  const cookieHeader = request.headers.get('cookie')
  if (!cookieHeader) return null
  
  const cookies = Object.fromEntries(
    cookieHeader.split('; ').map(c => {
      const [k, v] = c.split('=')
      return [k, v]
    })
  )
  
  const sessionId = cookies[SESSION_COOKIE]
  if (!sessionId) return null
  
  return getSession(sessionId)
}

export async function setSessionCookie(response: NextResponse, session: SessionData): Promise<NextResponse> {
  const secure = process.env.NODE_ENV === 'production'
  response.cookies.set(SESSION_COOKIE, session.id, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    maxAge: REFRESH_MAX_AGE,
    path: '/',
  })
  return response
}

export async function clearSessionCookie(response: NextResponse): Promise<NextResponse> {
  response.cookies.delete(SESSION_COOKIE)
  return response
}

export async function withSessionAuth(
  handler: (request: Request, session: SessionData) => Promise<NextResponse>
): Promise<(request: Request) => Promise<NextResponse>> {
  return async (request: Request) => {
    let session = await getSessionFromRequest(request)
    
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    if (Date.now() > session.expiresAt - 60 * 1000) {
      const newSession = await refreshSession(session.id)
      if (!newSession) {
        return NextResponse.json({ success: false, error: 'Session expired' }, { status: 401 })
      }
      session = newSession
    }
    
    const response = await handler(request, session)
    
    if (session.rotatedFrom) {
      await setSessionCookie(response, session)
    }
    
    return response
  }
}

export async function getTenantApiCredentials(tenantId: string) {
  return getTenantCredentials(tenantId)
}