import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createAccessToken, createRefreshToken, setAuthCookies } from '@/lib/billzo/auth-jwt'
import { setSession, findSessionsByUserId, checkRateLimit, incrementRateLimit } from '@/lib/billzo/auth-store'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, uid, name, phone } = body

    if (!email && !uid) {
      return NextResponse.json({ error: 'Missing credentials' }, { status: 400 })
    }

    // Rate limiting: 10 attempts per 15 min per IP, 5 per 15 min per email (graceful degradation)
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    try {
      const ipLimit = await checkRateLimit(`login:ip:${ip}`, 10, 900)
      if (!ipLimit.allowed) {
        return NextResponse.json({ error: ipLimit.reason }, { status: 429 })
      }
      if (email) {
        const emailLimit = await checkRateLimit(`login:email:${email}`, 5, 900)
        if (!emailLimit.allowed) {
          return NextResponse.json({ error: emailLimit.reason }, { status: 429 })
        }
      }
      await incrementRateLimit(`login:ip:${ip}`, 900)
      if (email) await incrementRateLimit(`login:email:${email}`, 900)
    } catch {
      console.warn('[Login] Rate limiter unavailable, proceeding without')
    }

    // Verify user exists in database
    if (uid) {
      const { data: user, error: userErr } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('id', uid)
        .maybeSingle()
      if (userErr || !user) {
        return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
      }
    } else if (email) {
      const { data: user, error: userErr } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('email', email)
        .maybeSingle()
      if (userErr || !user) {
        return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
      }
    }

    const userId: string = uid || `phone_${phone}`

    // Redis operations (non-critical — tokens are in cookies)
    let existingTenantId: string | undefined
    let existingIsPaid = false
    let existingPhone: string | undefined
    let sessionId = crypto.randomBytes(32).toString('hex')
    try {
      const existingSessions = await findSessionsByUserId(userId)
      const sessionWithTenant = existingSessions.find(s => s.tenantId)
      existingTenantId = sessionWithTenant?.tenantId || undefined
      existingIsPaid = sessionWithTenant?.isPaid || false
      existingPhone = existingSessions.find(s => s.phone)?.phone

      await setSession(sessionId, {
        userId,
        sessionId,
        tenantId: existingTenantId || null,
        isPaid: existingIsPaid,
        phone: phone || existingPhone,
        email: email || undefined,
        createdAt: Date.now(),
      })
    } catch {
      console.warn('[Login] Redis unavailable, proceeding with cookie-only auth')
    }

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
    response.cookies.set('bz_user_id', userId, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 3600,
      path: '/',
    })
    return response
  } catch (error: any) {
    const msg = error?.message || String(error)
    console.error('[Login] Error:', msg)
    if (msg.includes('JWT_SECRET')) {
      return NextResponse.json({ error: 'Auth configuration error' }, { status: 500 })
    }
    if (msg.includes('Redis') || msg.includes('connect')) {
      return NextResponse.json({ error: 'Service temporarily unavailable' }, { status: 503 })
    }
    return NextResponse.json({ error: 'Login failed' }, { status: 500 })
  }
}
