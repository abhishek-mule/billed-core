import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { sessionStore } from '@/lib/billzo/auth-store'
import {
  createAccessToken,
  createRefreshToken,
  setAuthCookies,
} from '@/lib/billzo/auth-jwt'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, uid, name, phone } = body

    if (!email && !uid) {
      return NextResponse.json({ error: 'Missing credentials' }, { status: 400 })
    }

    const userId: string = uid || `phone_${phone}`
    const sessionId = crypto.randomBytes(32).toString('hex')

    const existingSessions = Array.from(sessionStore.values()).filter((s) => s.userId === userId)
    const existingTenantId = existingSessions.length > 0 ? existingSessions[0].tenantId : undefined
    const existingIsPaid = existingSessions.length > 0 ? existingSessions[0].isPaid : false
    const existingPhone = existingSessions.find((s) => s.phone)?.phone

    sessionStore.set(sessionId, {
      userId,
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