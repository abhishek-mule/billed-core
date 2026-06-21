import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { createAccessToken, createRefreshToken, setAuthCookies } from '@/lib/billzo/auth-jwt'
import { setSession, findSessionsByUserId } from '@/lib/billzo/auth-store'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { tokenHash, type, code } = body

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: 'Auth not configured' }, { status: 503 })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    let sbSession: any = null
    let sbError: any = null

    if (tokenHash && type) {
      const result = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: type as any,
      })
      sbSession = result.data.session
      sbError = result.error
    } else if (code) {
      const result = await supabase.auth.exchangeCodeForSession(code)
      sbSession = result.data.session
      sbError = result.error
    } else {
      return NextResponse.json({ error: 'No token provided' }, { status: 400 })
    }

    if (sbError || !sbSession?.user) {
      // Record failed login event
      try {
        const supabase = createClient(supabaseUrl, supabaseServiceKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        })
        await supabase.from('login_events').insert({
          user_id: null,
          email: body.email || null,
          ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
          user_agent: request.headers.get('user-agent') || null,
          success: false,
        })
      } catch (e) {
        // Non-critical
      }
      return NextResponse.json({ error: sbError?.message || 'Auth failed' }, { status: 401 })
    }

    const userId = sbSession.user.id
    const email = sbSession.user.email || undefined

    const existingSessions = await findSessionsByUserId(userId)
    const existingWithTenant = existingSessions.find((s) => s.tenantId)
    const existingTenantId = existingWithTenant?.tenantId || undefined

    // Record successful login event
    try {
      const supabase = createClient(supabaseUrl, supabaseServiceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
      await supabase.from('login_events').insert({
        user_id: userId,
        email,
        ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
        user_agent: request.headers.get('user-agent') || null,
        success: true,
      })
    } catch (e) {
      // Non-critical
    }

    const sessionId = crypto.randomBytes(32).toString('hex')

    await setSession(sessionId, {
      userId,
      sessionId,
      tenantId: existingTenantId || null,
      isPaid: existingWithTenant?.isPaid || false,
      email,
      createdAt: Date.now(),
    })

    const accessToken = createAccessToken({
      sessionId,
      userId,
      tenantId: existingTenantId,
      email,
    })
    const refreshToken = createRefreshToken({ sessionId, userId })

    const response = NextResponse.json({
      success: true,
      userId,
      redirectTo: existingTenantId ? '/dashboard' : '/onboarding',
    })

    setAuthCookies(response, accessToken, refreshToken, existingTenantId)

    response.cookies.set('bz_user_id', userId, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 3600,
      path: '/',
    })

    return response
  } catch (error: any) {
    console.error('[Auth/Callback-Exchange] Error:', error?.message || error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
