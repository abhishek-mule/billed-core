import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createAccessToken, createRefreshToken, setAuthCookies } from '@/lib/billzo/auth-jwt'
import { setSession, findSessionsByUserId } from '@/lib/billzo/auth-store'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/onboarding'

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  try {
    if (!supabaseUrl || !supabaseKey) {
      console.error('[Callback] Supabase not configured')
      return NextResponse.redirect(new URL('/auth?error=config', request.url))
    }

    if (code) {
      const supabase = createClient(supabaseUrl, supabaseServiceKey || supabaseKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })

      const { data, error } = await supabase.auth.exchangeCodeForSession(code)

      if (!error && data.session?.user) {
        const userId = data.session.user.id
        const email = data.session.user.email || undefined
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

        const redirectUrl = existingTenantId ? '/dashboard' : next
        console.log('[Callback] Redirecting to:', redirectUrl, 'tenantId:', existingTenantId)

        const response = NextResponse.redirect(new URL(redirectUrl, request.url))
        setAuthCookies(response, accessToken, refreshToken, existingTenantId)
        return response
      }

      if (error) {
        console.error('[Callback] exchangeCodeForSession error:', error.message)
      }
    }

    return NextResponse.redirect(new URL('/auth?error=auth', request.url))
  } catch (err) {
    console.error('[Callback] Error:', err)
    return NextResponse.redirect(new URL('/auth?error=server', request.url))
  }
}