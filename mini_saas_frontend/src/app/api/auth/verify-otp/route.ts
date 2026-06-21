import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { createAccessToken, createRefreshToken, setAuthCookies } from '@/lib/billzo/auth-jwt'
import { getOtp, deleteOtp, setSession, findSessionsByPhone } from '@/lib/billzo/auth-store'
import { normalizePhoneE164, verifyOTPHash } from '@/lib/billzo/auth-utils'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { phone, otp } = body

    if (!phone || !otp) {
      return NextResponse.json({ error: 'Phone and OTP are required' }, { status: 400 })
    }

    const apiKey = process.env.MSG91_API_KEY
    const isProviderConfigured = !!(apiKey && !apiKey.startsWith('<') && apiKey.length > 10)
    const e164 = normalizePhoneE164(phone)
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

    // Record login event
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
      if (supabaseUrl && supabaseServiceKey) {
        const supabase = createClient(supabaseUrl, supabaseServiceKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        })
        await supabase.from('login_events').insert({
          user_id: userId,
          email: null,
          ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
          user_agent: request.headers.get('user-agent') || null,
          success: true,
        })
      }
    } catch (e) {
      // Non-critical: don't break login flow
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
      redirectTo: '/auth/resolve',
    })
    setAuthCookies(response, accessTokenJwt, refreshTokenJwt, existingTenantId)
    response.cookies.set('bz_user_id', userId, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 3600,
      path: '/',
    })

    return response
  } catch (error: any) {
    console.error('[Phone/verify] Error:', error?.message || error)
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 })
  }
}
