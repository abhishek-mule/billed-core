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
      try {
        await supabase.from('login_events').insert({
          user_id: null,
          email: body.email || null,
          ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
          user_agent: request.headers.get('user-agent') || null,
          success: false,
        })
      } catch { /* non-critical */ }
      return NextResponse.json({ error: sbError?.message || 'Auth failed' }, { status: 401 })
    }

    const userId = sbSession.user.id
    const email = sbSession.user.email || ''

    // ── Upsert user into the new users table (migration 053 not yet applied; non-critical) ──
    const now = new Date().toISOString()
    try {
      await supabase.from('users').upsert(
        { id: userId, email, updated_at: now },
        { onConflict: 'id', ignoreDuplicates: false },
      )
    } catch { /* users table may not exist yet; non-critical */ }

    // ── Check if user has an existing membership (tenant_memberships is the live table) ──
    let resolvedMerchantId: string | undefined = undefined
    let merchantName = ''

    const { data: membership } = await supabase
      .from('tenant_memberships')
      .select('tenant_id, tenants(id, name)')
      .eq('user_id', userId)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()

    if (membership) {
      resolvedMerchantId = membership.tenant_id
      merchantName = (membership as any).tenants?.name || ''
    }

    // ── Also check Redis sessions as final fallback (non-critical) ──
    if (!resolvedMerchantId) {
      try {
        const existingSessions = await findSessionsByUserId(userId)
        const existingWithTenant = existingSessions.find((s) => s.tenantId)
        resolvedMerchantId = existingWithTenant?.tenantId || undefined
      } catch {
        console.warn('[Auth/Callback-Exchange] Redis lookup failed, proceeding without cached tenant')
      }
    }

    // ── Record login event ──
    try {
      await supabase.from('login_events').insert({
        user_id: userId,
        email,
        ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
        user_agent: request.headers.get('user-agent') || null,
        success: true,
      })
    } catch { /* non-critical */ }

    // ── Create Redis session (non-critical; tokens are in cookies) ──
    const sessionId = crypto.randomBytes(32).toString('hex')
    try {
      await setSession(sessionId, {
        userId,
        sessionId,
        tenantId: resolvedMerchantId || null,
        isPaid: false,
        email,
        createdAt: Date.now(),
      })
    } catch {
      console.warn('[Auth/Callback-Exchange] Redis session storage failed, proceeding with cookie-only auth')
    }

    // ── Issue tokens ──
    let accessToken: string, refreshToken: string
    try {
      accessToken = createAccessToken({
        sessionId,
        userId,
        tenantId: resolvedMerchantId,
        email,
      })
      refreshToken = createRefreshToken({ sessionId, userId })
    } catch (jwtErr: any) {
      console.error('[Auth/Callback-Exchange] JWT creation failed:', jwtErr?.message)
      return NextResponse.json({ error: 'Auth configuration error — JWT secret not set' }, { status: 500 })
    }

    const redirectTo = resolvedMerchantId ? '/dashboard' : '/onboarding'

    const response = NextResponse.json({
      success: true,
      userId,
      merchantId: resolvedMerchantId,
      merchantName,
      redirectTo,
    })

    setAuthCookies(response, accessToken, refreshToken, resolvedMerchantId)

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
    console.error('[Auth/Callback-Exchange] Error:', msg)
    if (msg.includes('JWT_SECRET')) {
      return NextResponse.json({ error: 'Auth configuration error — JWT secret not set' }, { status: 500 })
    }
    return NextResponse.json({ error: 'Login failed. Please try again.' }, { status: 500 })
  }
}
