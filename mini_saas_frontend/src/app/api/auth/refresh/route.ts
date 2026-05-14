import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { verifyRefreshToken, createAccessToken, createRefreshToken, setAuthCookies } from '@/lib/billzo/auth-jwt'

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

    const newAccessToken = createAccessToken({
      sessionId: oldPayload.sessionId,
      userId: oldPayload.userId,
    })
    const newRefreshToken = createRefreshToken(oldPayload)

    const response = NextResponse.json({
      success: true,
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresIn: 15 * 24 * 3600,
    })

    setAuthCookies(response, newAccessToken, newRefreshToken)
    return response
  } catch (error) {
    console.error('[Refresh] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}