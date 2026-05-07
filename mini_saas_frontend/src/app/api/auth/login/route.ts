import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

// Simple JWT-like token generation (for demo - use real JWT in production)
function generateToken(payload: object, expiresIn: string = '15m'): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const expTime = expiresIn === '15m' 
    ? Date.now() + 15 * 60 * 1000 
    : Date.now() + 30 * 24 * 60 * 60 * 1000
  const data = Buffer.from(JSON.stringify({ 
    ...payload, 
    iat: Date.now(),
    exp: expTime
  })).toString('base64url')
  
  // Simple signature (in production use proper JWT signing)
  const signature = crypto.createHash('sha256').update(header + '.' + data).digest('base64url')
  
  return `${header}.${data}.${signature}`
}

function verifyToken(token: string): { valid: boolean; payload?: any } {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return { valid: false }
    
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString())
    
    if (payload.exp && Date.now() > payload.exp) {
      return { valid: false }
    }
    
    return { valid: true, payload }
  } catch {
    return { valid: false }
  }
}

// In-memory store (use Redis/DB in production)
const sessions = new Map<string, { userId: string; tenantId: string | null; isPaid: boolean; refreshToken: string }>()

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { phone, otp } = body

    // Validate phone
    if (!phone || phone.length !== 10) {
      return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 })
    }

    // Validate OTP (demo: accept 123456 or any 6-digit)
    if (!otp || otp.length !== 6) {
      return NextResponse.json({ error: 'Invalid OTP' }, { status: 400 })
    }

    // Demo: accept any 6-digit OTP (or 123456)
    // In production, verify against stored OTP with expiry
    if (otp !== '123456' && !/^\d{6}$/.test(otp)) {
      return NextResponse.json({ error: 'Invalid OTP' }, { status: 400 })
    }

    // Create user session
    const userId = `user_${phone}`
    const refreshToken = crypto.randomBytes(32).toString('hex')
    
    // Check if user has tenant (onboarding done)
    // In production, check DB
    const existingSession = Array.from(sessions.values()).find(s => s.userId === userId)
    const tenantId = existingSession?.tenantId || null
    const isPaid = existingSession?.isPaid || false

    // Store session
    sessions.set(refreshToken, { userId, tenantId, isPaid, refreshToken })

    // Generate tokens
    const accessToken = generateToken({ userId, tenantId, isPaid }, '15m')
    const newRefreshToken = generateToken({ userId }, '30d')

    // Replace refresh token
    if (existingSession) {
      sessions.delete(existingSession.refreshToken)
    }
    sessions.set(newRefreshToken, { userId, tenantId, isPaid, refreshToken: newRefreshToken })

    return NextResponse.json({
      success: true,
      userId,
      tenantId,
      isPaid,
      accessToken,
      refreshToken: newRefreshToken,
      expiresIn: 900 // 15 minutes in seconds
    })

  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}