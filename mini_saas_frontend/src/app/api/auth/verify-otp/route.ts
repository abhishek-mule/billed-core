import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createAccessToken, createRefreshToken, setAuthCookies } from '@/lib/billzo/auth-jwt'
import { sessionStore } from '@/lib/billzo/auth-store'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { hash, phone } = body

    if (!hash) {
      return NextResponse.json({ error: 'Hash token required' }, { status: 400 })
    }

    const apiKey = process.env.MSG91_API_KEY
    if (!apiKey || apiKey.startsWith('<')) {
      return NextResponse.json({ error: 'MSG91 not configured' }, { status: 500 })
    }

    const verifyRes = await fetch(
      'https://control.msg91.com/api/v5/widget/verifyAccessToken',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'authkey': apiKey,
        },
        body: JSON.stringify({ 'access-token': hash }),
      }
    )

    const data = await verifyRes.json()
    if (!verifyRes.ok) {
      console.error('[VerifyOTP] MSG91 error:', data)
      return NextResponse.json({ error: data.message || 'Token verification failed' }, { status: 401 })
    }

    const verifiedPhone = data.number || data.mobile || data.phone || phone
    const formattedPhone = verifiedPhone?.startsWith('91')
      ? verifiedPhone
      : `91${String(verifiedPhone || '').replace(/\D/g, '').slice(-10)}`

    console.log('[VerifyOTP] Phone verified:', formattedPhone)

    let userId: string
    let existingTenantId: string | undefined

    const existingSessions = Array.from(sessionStore.values()).filter(
      (s) => s.phone === formattedPhone && s.tenantId
    )
    if (existingSessions.length > 0) {
      userId = existingSessions[0].userId
      existingTenantId = existingSessions[0].tenantId || undefined
    } else {
      userId = `user_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`
      console.log('[VerifyOTP] New user:', userId)
    }

    const sessionId = crypto.randomBytes(32).toString('hex')
    sessionStore.set(sessionId, {
      userId,
      phone: formattedPhone,
      tenantId: existingTenantId || null,
      isPaid: false,
      createdAt: Date.now(),
    })

    const accessTokenJwt = createAccessToken({
      sessionId,
      userId,
      phone: formattedPhone,
      tenantId: existingTenantId,
    })
    const refreshTokenJwt = createRefreshToken({ sessionId, userId })

    const response = NextResponse.json({
      success: true,
      userId,
      phone: formattedPhone,
      redirectTo: existingTenantId ? '/dashboard' : '/onboarding',
    })
    setAuthCookies(response, accessTokenJwt, refreshTokenJwt, existingTenantId)

    return response
  } catch (error: any) {
    console.error('[VerifyOTP] Error:', error?.message || error)
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 })
  }
}