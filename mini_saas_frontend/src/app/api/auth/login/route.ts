import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createAccessToken, createRefreshToken, setAuthCookies } from '@/lib/billzo/auth-jwt'
import { setSession, findSessionsByUserId } from '@/lib/billzo/auth-store'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, uid, name, phone } = body

    if (!email && !uid) {
      return NextResponse.json({ error: 'Missing credentials' }, { status: 400 })
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
    response.cookies.set('bz_user_id', userId, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 3600,
      path: '/',
    })
    return response
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
