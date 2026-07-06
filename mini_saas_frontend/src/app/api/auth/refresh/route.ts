import { NextRequest, NextResponse } from 'next/server'
import { verifyRefreshToken, createAccessToken, createRefreshToken, setAuthCookies } from '@/lib/billzo/auth-jwt'
import { getSession } from '@/lib/billzo/auth-store'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { refreshToken } = body

    if (!refreshToken) {
      return NextResponse.json({ error: 'Refresh token required' }, { status: 400 })
    }

    const oldPayload = verifyRefreshToken(refreshToken)
    if (!oldPayload) {
      return NextResponse.json({ error: 'Invalid or expired refresh token' }, { status: 401 })
    }

    // Redis lookup (non-critical)
    let tenantId: string | undefined
    try {
      const session = await getSession(oldPayload.sessionId)
      tenantId = session?.tenantId || undefined
    } catch {
      console.warn('[Refresh] Redis unavailable, proceeding with JWT-only data')
    }

    // JWT creation
    let newAccessToken: string, newRefreshToken: string
    try {
      newAccessToken = createAccessToken({
        sessionId: oldPayload.sessionId,
        userId: oldPayload.userId,
        tenantId,
      })
      newRefreshToken = createRefreshToken(oldPayload)
    } catch (jwtErr: any) {
      console.error('[Refresh] JWT creation failed:', jwtErr?.message)
      return NextResponse.json({ error: 'Auth configuration error' }, { status: 500 })
    }

    const response = NextResponse.json({
      success: true,
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresIn: 14 * 24 * 3600,
    })

    setAuthCookies(response, newAccessToken, newRefreshToken, tenantId)
    return response
  } catch (error: any) {
    const msg = error?.message || String(error)
    console.error('[Refresh] Error:', msg)
    if (msg.includes('JWT_SECRET')) {
      return NextResponse.json({ error: 'Auth configuration error' }, { status: 500 })
    }
    return NextResponse.json({ error: 'Session refresh failed' }, { status: 500 })
  }
}