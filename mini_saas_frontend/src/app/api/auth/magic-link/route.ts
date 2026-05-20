import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { createAccessToken, createRefreshToken, setAuthCookies } from '@/lib/billzo/auth-jwt'
import { setSession, findSessionsByUserId } from '@/lib/billzo/auth-store'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json()

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email required' }, { status: 400 })
    }

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('[MagicLink] Supabase not configured: missing URL or anon key')
      return NextResponse.json({ error: 'Email login is not configured. Please use phone OTP.' }, { status: 503 })
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const redirectTo = `${request.nextUrl.origin}/auth/callback`
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    })

    if (error) {
      console.error('[MagicLink] Supabase error:', JSON.stringify(error))
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ success: true, message: 'Check your email for the magic link' })
  } catch (err: any) {
    console.error('[MagicLink] Catch error:', err?.message || err)
    return NextResponse.json({ error: 'Failed to send magic link' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const code = request.nextUrl.searchParams.get('code')
    const next = request.nextUrl.searchParams.get('next') || '/onboarding'

    if (!code) {
      return NextResponse.redirect(new URL('/auth', request.url))
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('[MagicLink] Supabase service key not configured')
      return NextResponse.redirect(new URL('/auth?error=config', request.url))
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: sbSession, error: sbError } = await supabase.auth.exchangeCodeForSession(code)

    if (sbError) {
      console.error('[MagicLink] exchangeCodeForSession error:', sbError.message, 'code:', sbError.status)
      return NextResponse.redirect(new URL('/auth?error=invalid', request.url))
    }
    if (!sbSession?.user) {
      console.error('[MagicLink] No user in session after exchange')
      return NextResponse.redirect(new URL('/auth?error=invalid', request.url))
    }

    console.log('[MagicLink] User authenticated:', sbSession.user.id, sbSession.user.email)

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

    const response = NextResponse.redirect(new URL(existingTenantId ? '/dashboard' : next, request.url))
    setAuthCookies(response, accessToken, refreshToken, existingTenantId)

    return response
  } catch (error) {
    console.error('[MagicLink] Error:', error)
    return NextResponse.redirect(new URL('/auth?error=failed', request.url))
  }
}