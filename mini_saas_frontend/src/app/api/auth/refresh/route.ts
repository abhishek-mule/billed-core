import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { sessionStore } from '@/lib/billzo/auth-store'

function generateToken(payload: object, type: 'access' | 'refresh'): string {
  const secret = process.env.JWT_SECRET || 'development-secret-change-in-production'
  const expTime = type === 'access' 
    ? Math.floor(Date.now() / 1000) + 3600
    : Math.floor(Date.now() / 1000) + 7 * 24 * 3600
  
  const data = { 
    ...payload, 
    iat: Math.floor(Date.now() / 1000),
    exp: expTime,
    type
  }
  
  const base64Payload = Buffer.from(JSON.stringify(data)).toString('base64url')
  const signature = crypto
    .createHmac('sha256', secret)
    .update(base64Payload)
    .digest('base64url')
  
  return `${base64Payload}.${signature}`
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { refreshToken } = body

    if (!refreshToken) {
      return NextResponse.json({ error: 'Refresh token required' }, { status: 400 })
    }

    // In this simple implementation, we decode the refresh token to get the sessionId
    const [payloadBase64] = refreshToken.split('.')
    if (!payloadBase64) {
      return NextResponse.json({ error: 'Invalid refresh token' }, { status: 401 })
    }

    const payload = JSON.parse(Buffer.from(payloadBase64, 'base64url').toString())
    if (payload.type !== 'refresh' || !payload.sessionId) {
      return NextResponse.json({ error: 'Invalid refresh token' }, { status: 401 })
    }

    const session = sessionStore.get(payload.sessionId)
    if (!session) {
      return NextResponse.json({ error: 'Session expired' }, { status: 401 })
    }

    // Generate new tokens
    const newAccessToken = generateToken({
      sessionId: payload.sessionId,
      userId: session.userId,
      phone: session.phone
    }, 'access')
    
    const newRefreshToken = generateToken({
      sessionId: payload.sessionId,
      userId: session.userId
    }, 'refresh')

    // Update session timestamp if needed
    session.createdAt = Date.now()
    sessionStore.set(payload.sessionId, session)

    return NextResponse.json({
      success: true,
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresIn: 900
    })

  } catch (error) {
    console.error('Refresh error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}