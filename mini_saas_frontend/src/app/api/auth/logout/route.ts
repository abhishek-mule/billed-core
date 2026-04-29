import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest, invalidateSession, clearSessionCookie, getSession } from '@/lib/session'
import { query } from '@/lib/db/client'

const SESSION_COOKIE = 'billzo_session'

async function handleLogout(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  
  if (session) {
    await invalidateSession(session.id)
    
    await query(
      `UPDATE sessions SET is_active = false, last_used_at = NOW() 
       WHERE id = $1`,
      [session.id]
    )
  }

  const { searchParams } = new URL(request.url)
  const logoutAll = searchParams.get('all') === 'true'
  
  if (logoutAll && session) {
    await query(
      `UPDATE sessions SET is_active = false 
       WHERE tenant_id = $1 AND is_active = true`,
      [session.tenantId]
    )
  }

  const response = NextResponse.json({ success: true })
  await clearSessionCookie(response)
  
  return response
}

export async function POST(request: NextRequest) {
  try {
    return await handleLogout(request)
  } catch (error) {
    console.error('[Logout] Error:', error)
    return NextResponse.json({ error: 'Logout failed' }, { status: 500 })
  }
}