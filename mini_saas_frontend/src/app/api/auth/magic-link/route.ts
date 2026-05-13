import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { createAccessToken, createRefreshToken, setAuthCookies } from '@/lib/billzo/auth-jwt'
import { sessionStore } from '@/lib/billzo/auth-store'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json()

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email required' }, { status: 400 })
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const redirectTo = `${request.nextUrl.origin}/api/auth/magic-link`
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    })

    if (error) {
      console.error('[MagicLink] Full error:', JSON.stringify(error))
      return NextResponse.json({ error: error.message, code: error.status, statusCode: error.status }, { status: 400 })
    }

    return NextResponse.json({ success: true, message: 'Check your email for the magic link' })
  } catch (err: any) {
    console.error('[MagicLink] Catch error:', err?.message || err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const code = request.nextUrl.searchParams.get('code')
    const next = request.nextUrl.searchParams.get('next') || '/onboarding'

    if (!code) {
      return NextResponse.redirect(new URL('/auth', request.url))
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: sbSession, error: sbError } = await supabase.auth.exchangeCodeForSession(code)

    if (sbError || !sbSession?.user) {
      console.error('[MagicLink] exchangeCodeForSession failed:', sbError?.message, '| session:', JSON.stringify(sbSession))
      return NextResponse.redirect(new URL('/auth?error=invalid', request.url))
    }

    console.log('[MagicLink] User authenticated:', sbSession.user.id, sbSession.user.email)

    const userId = sbSession.user.id
    const email = sbSession.user.email || undefined
    const existingSession = Array.from(sessionStore.values()).find((s) => s.userId === userId && s.tenantId)
    const existingTenantId = existingSession?.tenantId || undefined

    const sessionId = crypto.randomBytes(32).toString('hex')

    sessionStore.set(sessionId, {
      userId,
      tenantId: existingTenantId || null,
      isPaid: existingSession?.isPaid || false,
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
