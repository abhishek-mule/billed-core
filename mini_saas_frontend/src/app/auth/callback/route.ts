import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { createAccessToken, createRefreshToken, setAuthCookies } from '@/lib/billzo/auth-jwt'
import { setSession, findSessionsByUserId } from '@/lib/billzo/auth-store'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const code = request.nextUrl.searchParams.get('code')
    const next = request.nextUrl.searchParams.get('next') || '/onboarding'

    if (!code) {
      return NextResponse.redirect(new URL('/auth?error=missing_code', request.url))
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('[Auth/Callback] Supabase not configured: missing URL or service key')
      return NextResponse.redirect(new URL('/auth?error=config', request.url))
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: sbSession, error: sbError } = await supabase.auth.exchangeCodeForSession(code)

    if (sbError) {
      console.error('[Auth/Callback] exchangeCodeForSession error:', sbError.message)
      return NextResponse.redirect(new URL('/auth?error=invalid_code', request.url))
    }

    if (!sbSession?.user) {
      console.error('[Auth/Callback] No user in session after exchange')
      return NextResponse.redirect(new URL('/auth?error=no_user', request.url))
    }

    console.log('[Auth/Callback] User authenticated:', sbSession.user.id, sbSession.user.email)

    const userId = sbSession.user.id
    const email = sbSession.user.email || undefined

    const existingSessions = await findSessionsByUserId(userId)
    const existingWithTenant = existingSessions.find((s) => s.tenantId)
    const existingTenantId = existingWithTenant?.tenantId || undefined

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

    const redirectPath = existingTenantId ? '/dashboard' : next
    const response = NextResponse.redirect(new URL(redirectPath, request.url))
    setAuthCookies(response, accessToken, refreshToken, existingTenantId)

    return response
  } catch (error) {
    console.error('[Auth/Callback] Error:', error)
    return NextResponse.redirect(new URL('/auth?error=failed', request.url))
  }
}
