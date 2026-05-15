import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createAccessToken, createRefreshToken, setAuthCookies } from '@/lib/billzo/auth-jwt'
import { sessionStore } from '@/lib/billzo/auth-store'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { phone, otp } = body

    if (!phone || !otp) {
      return NextResponse.json({ error: 'Phone and OTP are required' }, { status: 400 })
    }

    const apiKey = process.env.MSG91_API_KEY
    if (!apiKey || apiKey.startsWith('<')) {
      return NextResponse.json({ error: 'MSG91 not configured' }, { status: 500 })
    }

    const formattedPhone = phone.startsWith('91') ? phone : `91${phone.replace(/\D/g, '').slice(-10)}`
    const mobile = phone.replace(/\D/g, '').slice(-10)

    const url = `https://api.msg91.com/api/verifyRequestOTP.php?authkey=${apiKey}&mobile=91${mobile}&otp=${otp}`
    const res = await fetch(url)
    const data = await res.json()

    if (!res.ok || data.type !== 'success') {
      console.error('[Phone/verify] MSG91 error:', data)
      return NextResponse.json({ error: data.message || 'Invalid OTP' }, { status: 401 })
    }

    console.log('[Phone/verify] Verified:', formattedPhone)

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
    }

    const sessionId = crypto.randomBytes(32).toString('hex')
    sessionStore.set(sessionId, {
      userId,
      phone: formattedPhone,
      tenantId: existingTenantId || null,
      isPaid: false,
      createdAt: Date.now(),
    })

    const accessTokenJwt = createAccessToken({ sessionId, userId, phone: formattedPhone, tenantId: existingTenantId })
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
    console.error('[Phone/verify] Error:', error?.message || error)
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 })
  }
}