import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { createAccessToken, createRefreshToken, setAuthCookies } from '@/lib/billzo/auth-jwt'
import { sessionStore } from '@/lib/billzo/auth-store'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json()

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email required' }, { status: 400 })
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${request.nextUrl.origin}/api/auth/magic-link`,
      },
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ success: true, message: 'Check your email for the magic link' })
  } catch {
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

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: sbSession, error: sbError } = await supabase.auth.exchangeCodeForSession(code)

    if (sbError || !sbSession?.user) {
      console.error('[MagicLink] Error:', sbError)
      return NextResponse.redirect(new URL('/auth?error=invalid', request.url))
    }

    const userId = sbSession.user.id
    const email = sbSession.user.email || undefined

    const sessionId = crypto.randomBytes(32).toString('hex')

    const existingSessions = Array.from(sessionStore.values()).filter((s) => s.userId === userId)
    const existingTenantId = existingSessions.length > 0 ? existingSessions[0].tenantId : undefined

    sessionStore.set(sessionId, {
      userId,
      tenantId: existingTenantId || null,
      isPaid: existingSessions.length > 0 ? existingSessions[0].isPaid : false,
      email,
      createdAt: Date.now(),
    })

    const accessToken = createAccessToken({
      sessionId,
      userId,
      tenantId: existingTenantId ?? undefined,
      email,
    })
    const refreshToken = createRefreshToken({ sessionId, userId })

    const response = NextResponse.redirect(new URL(next, request.url))
    setAuthCookies(response, accessToken, refreshToken, existingTenantId ?? undefined)

    return response
  } catch (error) {
    console.error('[MagicLink] Error:', error)
    return NextResponse.redirect(new URL('/auth?error=failed', request.url))
  }
}