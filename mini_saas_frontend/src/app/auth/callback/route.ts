import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createAccessToken, createRefreshToken, setAuthCookies } from '@/lib/billzo/auth-jwt'
import { sessionStore } from '@/lib/billzo/auth-store'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/onboarding'

  try {
    // Check if required env vars are set
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

    if (!supabaseUrl || !supabaseKey) {
      console.error('Supabase environment variables not configured')
      return NextResponse.redirect(new URL('/auth?error=config', request.url))
    }

    if (code) {
      const supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })

      const { data, error } = await supabase.auth.exchangeCodeForSession(code)

      if (!error && data.session?.user) {
        const userId = data.session.user.id
        const email = data.session.user.email || undefined
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
      }

      if (error) {
        console.error('Failed to exchange code for session:', error)
      }
    }

    // No code or error - redirect to login with error
    return NextResponse.redirect(new URL('/auth?error=auth', request.url))
  } catch (err) {
    console.error('Auth callback error:', err)
    return NextResponse.redirect(new URL('/auth?error=server', request.url))
  }
}
