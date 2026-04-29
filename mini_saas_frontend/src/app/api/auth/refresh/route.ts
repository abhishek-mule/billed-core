import { NextResponse } from 'next/server'
import { getSessionFromRequest, refreshSession } from '@/lib/session'

const SESSION_COOKIE = 'billzo_session'

export async function POST(request: Request) {
  try {
    const session = await getSessionFromRequest(request)
    
    if (!session) {
      return NextResponse.json({ error: 'No session' }, { status: 401 })
    }

    const newSession = await refreshSession(session.id)
    
    if (!newSession) {
      return NextResponse.json({ error: 'Session expired' }, { status: 401 })
    }

    const response = NextResponse.json({
      success: true,
      session: {
        tenantId: newSession.tenantId,
        companyName: newSession.companyName,
        role: newSession.role,
        plan: newSession.plan,
      }
    })

    response.cookies.set(SESSION_COOKIE, newSession.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 604800,
      path: '/',
    })

    return response
  } catch (error) {
    console.error('[Refresh] Error:', error)
    return NextResponse.json({ error: 'Refresh failed' }, { status: 500 })
  }
}