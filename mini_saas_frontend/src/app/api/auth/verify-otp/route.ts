import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createAccessToken, createRefreshToken, setAuthCookies } from '@/lib/billzo/auth-jwt'
import { getOtp, deleteOtp, setSession, findSessionsByPhone } from '@/lib/billzo/auth-store'
import { normalizePhone, verifyOTPHash } from '@/lib/billzo/auth-utils'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { phone, otp } = body

    if (!phone || !otp) {
      return NextResponse.json({ error: 'Phone and OTP are required' }, { status: 400 })
    }

    const apiKey = process.env.MSG91_API_KEY
    const isProviderConfigured = !!(apiKey && !apiKey.startsWith('<') && apiKey.length > 10)
    const e164 = normalizePhone(phone)
    const storedOtp = await getOtp(e164)

    if (!storedOtp) {
      return NextResponse.json({ error: 'OTP not found. Please request a new OTP.' }, { status: 404 })
    }
    if (Date.now() - storedOtp.createdAt > 5 * 60 * 1000) {
      await deleteOtp(e164)
      return NextResponse.json({ error: 'OTP expired. Please request a new OTP.' }, { status: 401 })
    }
    if (!verifyOTPHash(storedOtp.hash, otp, e164)) {
      return NextResponse.json({ error: 'Invalid OTP' }, { status: 401 })
    }

    await deleteOtp(e164)

    if (isProviderConfigured) {
      const url = `https://api.msg91.com/api/verifyRequestOTP.php?authkey=${apiKey}&mobile=${e164.replace('+', '')}&otp=${otp}`
      try {
        const res = await fetch(url)
        const data = await res.json()
        if (!res.ok || data.type !== 'success') {
          console.error('[Phone/verify] MSG91 verify failed (but local passed):', data)
        }
      } catch (e) {
        console.error('[Phone/verify] MSG91 verify call failed:', e)
      }
    }

    console.log('[Phone/verify] Verified:', e164)

    let userId: string
    let existingTenantId: string | undefined

    const existingSessions = await findSessionsByPhone(e164)
    const existingWithTenant = existingSessions.filter((s) => s.tenantId)
    if (existingWithTenant.length > 0) {
      userId = existingWithTenant[0].userId
      existingTenantId = existingWithTenant[0].tenantId || undefined
    } else {
      userId = `user_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`
    }

    const sessionId = crypto.randomBytes(32).toString('hex')
    await setSession(sessionId, {
      userId,
      sessionId,
      phone: e164,
      tenantId: existingTenantId || null,
      isPaid: false,
      createdAt: Date.now(),
    })

    const accessTokenJwt = createAccessToken({ sessionId, userId, phone: e164, tenantId: existingTenantId })
    const refreshTokenJwt = createRefreshToken({ sessionId, userId })

    const response = NextResponse.json({
      success: true,
      userId,
      phone: e164,
      redirectTo: existingTenantId ? '/dashboard' : '/onboarding',
    })
    setAuthCookies(response, accessTokenJwt, refreshTokenJwt, existingTenantId)

    return response
  } catch (error: any) {
    console.error('[Phone/verify] Error:', error?.message || error)
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 })
  }
}