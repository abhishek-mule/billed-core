import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import {
  createAccessToken,
  createRefreshToken,
  setAuthCookies,
} from '@/lib/billzo/auth-jwt'
import { setSession, findSessionsByUserId } from '@/lib/billzo/auth-store'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!

async function upsertSession(userId: string, data: { email?: string; tenantId?: string | null; isPaid?: boolean }) {
  const sessionId = crypto.randomBytes(32).toString('hex')
  await setSession(sessionId, {
    userId,
    sessionId,
    tenantId: data.tenantId ?? null,
    isPaid: data.isPaid ?? false,
    email: data.email,
    createdAt: Date.now(),
  })
  return sessionId
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, password, accessToken: supabaseAccessToken } = body

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    if (supabaseAccessToken) {
      const { data, error } = await supabase.auth.getUser(supabaseAccessToken)

      if (error || !data.user) {
        return NextResponse.json({ error: 'Invalid Supabase session' }, { status: 401 })
      }

      const userId = data.user.id
      const userEmail = data.user.email || undefined
      const existingSessions = await findSessionsByUserId(userId)
      const existingWithTenant = existingSessions.find(s => s.tenantId)
      const existingTenantId = existingWithTenant?.tenantId || undefined

      const sessionId = await upsertSession(userId, {
        email: userEmail,
        tenantId: existingTenantId,
        isPaid: existingWithTenant?.isPaid || false,
      })

      const billzoAccessToken = createAccessToken({
        sessionId,
        userId,
        tenantId: existingTenantId,
        email: userEmail,
      })
      const billzoRefreshToken = createRefreshToken({ sessionId, userId })

      const response = NextResponse.json({
        success: true,
        userId,
        tenantId: existingTenantId,
        email: userEmail,
        redirectTo: existingTenantId ? '/dashboard' : '/onboarding',
      })

      setAuthCookies(response, billzoAccessToken, billzoRefreshToken, existingTenantId)
      return response
    }

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    }

    const { data: sbSession, error: sbError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (sbError || !sbSession.user) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    const userId = sbSession.user.id
    const existingSessions = await findSessionsByUserId(userId)
    const existingWithTenant = existingSessions.find(s => s.tenantId)
    const existingTenantId = existingWithTenant?.tenantId || undefined

    const sessionId = await upsertSession(userId, {
      email,
      tenantId: existingTenantId,
      isPaid: existingWithTenant?.isPaid || false,
    })

    const accessToken = createAccessToken({
      sessionId,
      userId,
      tenantId: existingTenantId ?? undefined,
      email,
    })
    const refreshToken = createRefreshToken({ sessionId, userId })

    const response = NextResponse.json({
      success: true,
      userId,
      tenantId: existingTenantId,
      email,
    })

    setAuthCookies(response, accessToken, refreshToken, existingTenantId ?? undefined)
    return response
  } catch (error) {
    console.error('[Auth/Supabase] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const code = request.nextUrl.searchParams.get('code')
    const next = request.nextUrl.searchParams.get('next') || '/'

    if (!code) {
      return NextResponse.redirect(new URL('/auth', request.url))
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: sbSession, error: sbError } = await supabase.auth.exchangeCodeForSession(code)

    if (sbError || !sbSession.user) {
      console.error('[Auth/Callback] Supabase error:', sbError)
      return NextResponse.redirect(new URL('/login?error=auth_failed', request.url))
    }

    const userId = sbSession.user.id
    const email = sbSession.user.email || undefined
    const existingSessions = await findSessionsByUserId(userId)
    const existingWithTenant = existingSessions.find(s => s.tenantId)
    const existingTenantId = existingWithTenant?.tenantId || undefined

    const sessionId = await upsertSession(userId, {
      email,
      tenantId: existingTenantId,
      isPaid: existingWithTenant?.isPaid || false,
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
  } catch {
    console.error('[Auth/Callback] Error')
    return NextResponse.redirect(new URL('/login?error=auth_failed', request.url))
  }
}