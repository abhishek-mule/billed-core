import { NextResponse } from 'next/server'
import { getSessionFromRequest, invalidateSession, clearSessionCookie } from '@/lib/session'

async function handleLogout(request: Request) {
  const session = await getSessionFromRequest(request)
  
  if (session) {
    await invalidateSession(session.id)
  }

  const response = NextResponse.json({ success: true })
  await clearSessionCookie(response)
  
  return response
}

export const POST = handleLogout