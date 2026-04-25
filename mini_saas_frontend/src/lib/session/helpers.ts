import crypto from 'crypto'

const SESSION_COOKIE = process.env.SESSION_COOKIE_NAME || 'billzo_session'
const SESSION_EXPIRY = 900
const REFRESH_EXPIRY = 604800

export interface Session {
  id: string
  tenantId: string
  userId: string
  role: string
  ipAddress?: string
  userAgent?: string
  createdAt: number
  expiresAt: number
  refreshExpiresAt: number
  rotatedFrom?: string
}

function generateId(): string {
  return crypto.randomBytes(24).toString('hex')
}

function getRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  
  if (!url || !token || !url.startsWith('https')) {
    return null
  }
  
  const { Redis } = require('@upstash/redis')
  return new Redis({ url, token })
}

function getMemoryFallback() {
  return {
    store: new Map<string, Session>(),
    tenantSessions: new Map<string, Set<string>>(),
    
    async get(id: string): Promise<Session | null> {
      const session = this.store.get(id)
      if (!session) return null
      if (Date.now() > session.expiresAt) {
        await this.delete(id)
        return null
      }
      return session
    },
    
    async set(id: string, session: Session): Promise<void> {
      this.store.set(id, session)
      if (!this.tenantSessions.has(session.tenantId)) {
        this.tenantSessions.set(session.tenantId, new Set())
      }
      this.tenantSessions.get(session.tenantId)!.add(id)
    },
    
    async delete(id: string): Promise<void> {
      const session = this.store.get(id)
      if (session) {
        this.store.delete(id)
        const tenantSet = this.tenantSessions.get(session.tenantId)
        if (tenantSet) {
          tenantSet.delete(id)
        }
      }
    },
    
    async getTenantSessions(tenantId: string): Promise<Set<string> | null> {
      return this.tenantSessions.get(tenantId) || null
    },
    
    async destroyTenant(tenantId: string): Promise<void> {
      const sessionIds = this.tenantSessions.get(tenantId)
      if (sessionIds) {
        for (const id of sessionIds) {
          this.store.delete(id)
        }
        this.tenantSessions.delete(tenantId)
      }
    }
  }
}

let redisClient: any = null

async function getClient() {
  if (!redisClient) {
    try {
      const redis = getRedis()
      if (redis) {
        await redis.ping()
        redisClient = redis
      } else {
        console.warn('[Session] Redis not configured, using memory fallback')
        redisClient = getMemoryFallback()
      }
    } catch {
      console.warn('[Session] Redis unavailable, using memory fallback')
      redisClient = getMemoryFallback()
    }
  }
  return redisClient
}

export async function createSession(data: {
  tenantId: string
  userId: string
  role: string
  ipAddress?: string
  userAgent?: string
}): Promise<Session> {
  const now = Date.now()
  const session: Session = {
    id: generateId(),
    tenantId: data.tenantId,
    userId: data.userId,
    role: data.role,
    ipAddress: data.ipAddress,
    userAgent: data.userAgent,
    createdAt: now,
    expiresAt: now + SESSION_EXPIRY * 1000,
    refreshExpiresAt: now + REFRESH_EXPIRY * 1000,
  }

  const client = await getClient()
  await client.set(`session:${session.id}`, JSON.stringify(session))
  
  return session
}

export async function getSession(id: string): Promise<Session | null> {
  const client = await getClient()
  const stored = await client.get(`session:${id}`)
  if (!stored) return null
  
  const session = typeof stored === 'string' ? JSON.parse(stored) : stored as Session
  
  if (Date.now() > session.expiresAt) {
    await destroySession(id)
    return null
  }
  
  return session
}

export async function refreshSession(oldId: string): Promise<Session | null> {
  const old = await getSession(oldId)
  if (!old) return null
  
  if (Date.now() > old.refreshExpiresAt) {
    await destroySession(oldId)
    return null
  }
  
  await destroySession(oldId)
  
  const newSession: Session = {
    ...old,
    id: generateId(),
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_EXPIRY * 1000,
    rotatedFrom: oldId,
  }

  const client = await getClient()
  await client.set(`session:${newSession.id}`, JSON.stringify(newSession))
  
  return newSession
}

export async function destroySession(id: string): Promise<null> {
  const client = await getClient()
  await client.del(`session:${id}`)
  return null
}

export async function destroyTenantSessions(tenantId: string): Promise<void> {
  const client = await getClient()
  const keys = await client.keys(`session:*`)
  for (const key of keys) {
    const session = await client.get(key)
    if (session && typeof session !== 'string' && session.tenantId === tenantId) {
      await client.del(key)
    }
  }
}

export async function destroyAllUserSessions(userId: string): Promise<number> {
  const client = await getClient()
  const keys = await client.keys(`session:*`)
  let count = 0
  for (const key of keys) {
    const session = await client.get(key)
    if (session && typeof session !== 'string' && session.userId === userId) {
      await client.del(key)
      count++
    }
  }
  return count
}

export async function getSessionFromRequest(request: Request): Promise<Session | null> {
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

export function setSessionCookie(response: Response, session: Session): Response {
  const isProd = process.env.NODE_ENV === 'production'
  ;(response as any).cookies?.set?.(SESSION_COOKIE, session.id, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    maxAge: REFRESH_EXPIRY,
    path: '/',
  })
  return response
}

export function clearSessionCookie(response: Response): Response {
  ;(response as any).cookies?.delete?.(SESSION_COOKIE)
  return response
}

export async function withSessionAuth(
  handler: (request: Request, session: Session) => Promise<Response>
): Promise<(request: Request) => Promise<Response>> {
  return async (request: Request) => {
    const session = await getSessionFromRequest(request)
    
    if (!session) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const now = Date.now()
    if (session.expiresAt - now < SESSION_EXPIRY * 500) {
      const refreshed = await refreshSession(session.id)
      if (!refreshed) {
        return Response.json({ success: false, error: 'Session expired' }, { status: 401 })
      }
      
      const response = await handler(request, refreshed)
      setSessionCookie(response, refreshed)
      return response
    }
    
    return handler(request, session)
  }
}