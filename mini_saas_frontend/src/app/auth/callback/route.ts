import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { createAccessToken, createRefreshToken, setAuthCookies } from '@/lib/billzo/auth-jwt'
import { setSession, findSessionsByUserId } from '@/lib/billzo/auth-store'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  console.log('[Auth/Callback] === START ===')
  console.log('[Auth/Callback] Full URL:', url.toString())
  console.log('[Auth/Callback] Search params:', Object.fromEntries(url.searchParams.entries()))

  try {
    const tokenHash = url.searchParams.get('token_hash')
    const type = url.searchParams.get('type')
    const code = url.searchParams.get('code')
    console.log('[Auth/Callback] tokenHash:', tokenHash ? 'present (' + tokenHash.substring(0, 10) + '...)' : 'MISSING')
    console.log('[Auth/Callback] type:', type || 'MISSING')
    console.log('[Auth/Callback] code:', code ? 'present (' + code.substring(0, 10) + '...)' : 'MISSING')

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAuthKey =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl) {
      console.error('[Auth/Callback] FAIL: Missing NEXT_PUBLIC_SUPABASE_URL')
      return NextResponse.redirect(new URL('/auth?error=config', request.url))
    }
    if (!supabaseAuthKey) {
      console.error('[Auth/Callback] FAIL: Missing Supabase publishable/anon key')
      return NextResponse.redirect(new URL('/auth?error=config', request.url))
    }

    console.log('[Auth/Callback] Supabase URL:', supabaseUrl.substring(0, 30) + '...')
    console.log('[Auth/Callback] Auth key length:', supabaseAuthKey.length)

    const supabase = createClient(supabaseUrl, supabaseAuthKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    let sbSession: any = null
    let sbError: any = null

    if (tokenHash && type) {
      console.log('[Auth/Callback] Calling verifyOtp with type:', type)
      const result = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: type as any,
      })
      sbSession = result.data.session
      sbError = result.error
      console.log('[Auth/Callback] verifyOtp result:', sbSession ? 'SESSION OK' : 'NO SESSION', sbError ? 'ERROR: ' + sbError.message : '')
    } else if (code) {
      console.log('[Auth/Callback] Calling exchangeCodeForSession')
      const result = await supabase.auth.exchangeCodeForSession(code)
      sbSession = result.data.session
      sbError = result.error
      console.log('[Auth/Callback] exchangeCodeForSession result:', sbSession ? 'SESSION OK' : 'NO SESSION', sbError ? 'ERROR: ' + sbError.message : '')
    } else {
      console.log('[Auth/Callback] FAIL: No token_hash or code')
      return NextResponse.redirect(new URL('/auth?error=missing_token', request.url))
    }

    if (sbError) {
      console.error('[Auth/Callback] FAIL: Supabase error:', JSON.stringify(sbError))
      return NextResponse.redirect(new URL('/auth?error=invalid', request.url))
    }

    if (!sbSession?.user) {
      console.error('[Auth/Callback] FAIL: No user in session')
      return NextResponse.redirect(new URL('/auth?error=no_user', request.url))
    }

    console.log('[Auth/Callback] User:', sbSession.user.id, sbSession.user.email)

    const userId = sbSession.user.id
    const email = sbSession.user.email || undefined

    console.log('[Auth/Callback] Finding existing sessions...')
    const existingSessions = await findSessionsByUserId(userId)
    console.log('[Auth/Callback] Found', existingSessions.length, 'sessions')
    const existingWithTenant = existingSessions.find((s) => s.tenantId)
    const existingTenantId = existingWithTenant?.tenantId || undefined
    console.log('[Auth/Callback] Tenant:', existingTenantId || 'none (new user)')

    const sessionId = crypto.randomBytes(32).toString('hex')

    console.log('[Auth/Callback] Creating session...')
    await setSession(sessionId, {
      userId,
      sessionId,
      tenantId: existingTenantId || null,
      isPaid: existingWithTenant?.isPaid || false,
      email,
      createdAt: Date.now(),
    })

    console.log('[Auth/Callback] Creating JWT tokens...')
    const accessToken = createAccessToken({
      sessionId,
      userId,
      tenantId: existingTenantId,
      email,
    })
    const refreshToken = createRefreshToken({ sessionId, userId })

    const redirectPath = '/auth/resolve'
    console.log('[Auth/Callback] Redirecting to:', redirectPath)

    const response = NextResponse.redirect(new URL(redirectPath, request.url))
    setAuthCookies(response, accessToken, refreshToken, existingTenantId)

    response.cookies.set('bz_user_id', userId, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 3600,
      path: '/',
    })

    console.log('[Auth/Callback] === SUCCESS === cookies set, redirecting to', redirectPath)

    return response
  } catch (error: any) {
    console.error('[Auth/Callback] === UNCAUGHT ERROR ===')
    console.error('[Auth/Callback] Message:', error?.message || error)
    console.error('[Auth/Callback] Stack:', error?.stack)
    return NextResponse.redirect(new URL('/auth?error=failed', request.url))
  }
}
