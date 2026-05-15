import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createAccessToken, createRefreshToken, setAuthCookies } from '@/lib/billzo/auth-jwt'
import { otpStore, sessionStore } from '@/lib/billzo/auth-store'
import { isOTPExpired, normalizePhone, verifyOTPHash } from '@/lib/billzo/auth-utils'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { phone, otp } = body

    if (!phone || !otp) {
      return NextResponse.json({ error: 'Phone and OTP are required' }, { status: 400 })
    }

    const apiKey = process.env.MSG91_API_KEY
    const isProviderConfigured = !!(apiKey && !apiKey.startsWith('<'))
    const { e164: formattedPhone, local } = normalizePhone(phone)

    if (isProviderConfigured) {
      const url = `https://api.msg91.com/api/verifyRequestOTP.php?authkey=${apiKey}&mobile=91${local}&otp=${otp}`
      const res = await fetch(url)
      const data = await res.json()

      if (!res.ok || data.type !== 'success') {
        console.error('[Phone/verify] MSG91 error:', data)
        return NextResponse.json({ error: data.message || 'Invalid OTP' }, { status: 401 })
      }
    } else {
      const storedOtp = otpStore.get(formattedPhone)
      if (!storedOtp) {
        return NextResponse.json({ error: 'OTP not found. Please request a new OTP.' }, { status: 404 })
      }
      if (isOTPExpired(storedOtp.createdAt)) {
        otpStore.delete(formattedPhone)
        return NextResponse.json({ error: 'OTP expired. Please request a new OTP.' }, { status: 401 })
      }
      if (!verifyOTPHash(storedOtp.hash, otp, formattedPhone)) {
        return NextResponse.json({ error: 'Invalid OTP' }, { status: 401 })
      }
      otpStore.delete(formattedPhone)
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
