import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import {
  createAccessToken,
  createRefreshToken,
  setAuthCookies,
} from '@/lib/billzo/auth-jwt'
import { setSession, findSessionsByUserId } from '@/lib/billzo/auth-store'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAuthKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY

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
    console.log('[Auth/Supabase] POST received')

    if (!supabaseUrl || !supabaseAuthKey) {
      console.error('[Auth/Supabase] Missing config: url=', !!supabaseUrl, 'key=', !!supabaseAuthKey)
      return NextResponse.json({ error: 'Auth not configured' }, { status: 503 })
    }

    const body = await request.json()
    console.log('[Auth/Supabase] Body keys:', Object.keys(body))
    const { email, password, accessToken: supabaseAccessToken } = body

    const supabase = createClient(supabaseUrl, supabaseAuthKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    if (supabaseAccessToken) {
      console.log('[Auth/Supabase] Validating access token')
      const { data, error } = await supabase.auth.getUser(supabaseAccessToken)

      if (error) {
        console.error('[Auth/Supabase] getUser error:', error.message, 'status:', error.status)
        return NextResponse.json({ error: 'Invalid Supabase session: ' + error.message }, { status: 401 })
      }
      if (!data.user) {
        console.error('[Auth/Supabase] No user in session')
        return NextResponse.json({ error: 'Invalid Supabase session' }, { status: 401 })
      }

      console.log('[Auth/Supabase] User:', data.user.id, data.user.email)

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
        redirectTo: '/auth/resolve',
      })

      setAuthCookies(response, billzoAccessToken, billzoRefreshToken, existingTenantId)
      response.cookies.set('bz_user_id', userId, {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 24 * 3600,
        path: '/',
      })
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
    response.cookies.set('bz_user_id', userId, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 3600,
      path: '/',
    })
    return response
  } catch (error: any) {
    console.error('[Auth/Supabase] UNCAUGHT:', error?.message || error)
    console.error('[Auth/Supabase] Stack:', error?.stack)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
