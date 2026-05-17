import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createAccessToken, createRefreshToken, setAuthCookies } from '@/lib/billzo/auth-jwt'
import { setSession, findSessionsByUserId } from '@/lib/billzo/auth-store'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, uid, name, phone } = body

    if (!email && !uid) {
      return NextResponse.json({ error: 'Missing credentials' }, { status: 400 })
    }

    const userId: string = uid || `phone_${phone}`

    const existingSessions = await findSessionsByUserId(userId)
    const existingTenantId = existingSessions.find(s => s.tenantId)?.tenantId || undefined
    const existingIsPaid = existingSessions.find(s => s.tenantId)?.isPaid || false
    const existingPhone = existingSessions.find(s => s.phone)?.phone

    const sessionId = crypto.randomBytes(32).toString('hex')
    await setSession(sessionId, {
      userId,
      sessionId,
      tenantId: existingTenantId || null,
      isPaid: existingIsPaid,
      phone: phone || existingPhone,
      email: email || undefined,
      createdAt: Date.now(),
    })

    const accessToken = createAccessToken({ sessionId, userId, tenantId: existingTenantId ?? undefined, phone: phone || existingPhone || undefined, email })
    const refreshToken = createRefreshToken({ sessionId, userId })

    const response = NextResponse.json({
      success: true,
      userId,
      tenantId: existingTenantId,
      isPaid: existingIsPaid,
      accessToken,
      refreshToken,
      expiresIn: 14 * 24 * 3600,
    })

    setAuthCookies(response, accessToken, refreshToken, existingTenantId || undefined)
    return response
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}