import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

// Simple token generation (matching login)
function generateToken(payload: object, type: 'access' | 'refresh'): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  
  const expTime = type === 'access' 
    ? Date.now() + 15 * 60 * 1000  // 15 min
    : Date.now() + 30 * 24 * 60 * 60 * 1000  // 30 days
  
  const data = Buffer.from(JSON.stringify({ 
    ...payload, 
    iat: Date.now(),
    exp: expTime,
    type
  })).toString('base64url')
  
  const signature = crypto.createHash('sha256').update(header + '.' + data).digest('base64url')
  
  return `${header}.${data}.${signature}`
}

// Sessions store (shared with login - in production use DB)
const sessions = new Map<string, { userId: string; tenantId: string | null; isPaid: boolean; refreshToken: string }>()

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { refreshToken } = body

    if (!refreshToken) {
      return NextResponse.json({ error: 'Refresh token required' }, { status: 400 })
    }

    // Find session by refresh token
    let session = sessions.get(refreshToken)
    
    if (!session) {
      // Try to find by iterating (demo only)
      const found = Array.from(sessions.entries()).find(([_, s]) => s.refreshToken === refreshToken)
      if (!found) {
        return NextResponse.json({ error: 'Invalid refresh token' }, { status: 401 })
      }
      session = found[1]
    }

    if (!session) {
      return NextResponse.json({ error: 'Session expired' }, { status: 401 })
    }

    // Generate new tokens
    const newAccessToken = generateToken({
      userId: session.userId,
      tenantId: session.tenantId,
      isPaid: session.isPaid
    }, 'access')
    
    const newRefreshToken = generateToken({
      userId: session.userId
    }, 'refresh')

    // Update session
    sessions.delete(refreshToken)
    sessions.set(newRefreshToken, session)

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