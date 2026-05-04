import { cookies } from 'next/headers'
import { getSession, type SessionData } from '@/lib/session'
import { redirect } from 'next/navigation'

/**
 * Server Component auth guard
 * Usage: await requireAuth()
 */
export async function requireAuth(): Promise<SessionData> {
  const cookieStore = await cookies()
  const sessionId = cookieStore.get('billzo_session')?.value

  if (!sessionId) {
    redirect('/login')
  }

  const session = await getSession(sessionId)

  if (!session) {
    redirect('/login')
  }

  return session
}

/**
 * For pages that should return null instead of redirect
 * Usage: const session = await getOptionalAuth()
 */
export async function getOptionalAuth(): Promise<SessionData | null> {
  const cookieStore = await cookies()
  const sessionId = cookieStore.get('billzo_session')?.value

  if (!sessionId) return null

  return getSession(sessionId)
}

/**
 * For layout server components - redirect if no auth
 */
export async function requireAuthInLayout(): Promise<SessionData> {
  const session = await getOptionalAuth()
  
  if (!session) {
    redirect('/login')
  }

  return session
}