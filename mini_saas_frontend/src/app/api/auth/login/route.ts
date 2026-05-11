import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { sessionStore } from '@/lib/billzo/auth-store'

// Simple JWT-like token generation (for demo - use real JWT in production)
function generateToken(payload: object, type: 'access' | 'refresh'): string {
  const secret = process.env.JWT_SECRET || 'development-secret-change-in-production'
  const expTime = type === 'access' 
    ? Math.floor(Date.now() / 1000) + 3600
    : Math.floor(Date.now() / 1000) + 30 * 24 * 3600
  
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
    const { email, uid, name, phone } = body

    // Accept either email OR uid (phone auth uses uid only)
    if (!email && !uid) {
      return NextResponse.json({ error: 'Missing credentials' }, { status: 400 })
    }

    // Create user session
    // Create or update user session
    const userId = uid || `phone_${phone}`
    const sessionId = crypto.randomBytes(32).toString('hex')
    
    // Check if user already has a session to preserve tenantId/isPaid
    const existingSessions = Array.from(sessionStore.values()).filter(s => s.userId === userId)
    const tenantId = existingSessions.length > 0 ? existingSessions[0].tenantId : null
    const isPaid = existingSessions.length > 0 ? existingSessions[0].isPaid : false
    const phoneNum = phone || existingSessions.find(s => s.phone)?.phone

    // Store new session
    sessionStore.set(sessionId, {
      userId,
      tenantId,
      isPaid,
      phone: phoneNum,
      email: email || undefined,
      createdAt: Date.now()
    })

    // Generate tokens
    const accessToken = generateToken({ sessionId, userId, tenantId, isPaid }, 'access')
    const refreshToken = generateToken({ sessionId, userId }, 'refresh')

    return NextResponse.json({
      success: true,
      userId,
      tenantId,
      isPaid,
      accessToken,
      refreshToken,
      expiresIn: 3600
    })

  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}