import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createAccessToken, createRefreshToken, setAuthCookies } from '@/lib/billzo/auth-jwt'
import { sessionStore } from '@/lib/billzo/auth-store'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { accessToken } = body

    if (!accessToken) {
      return NextResponse.json({ error: 'Access token required' }, { status: 400 })
    }

    const apiKey = process.env.MSG91_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'MSG91 not configured' }, { status: 500 })
    }

    const verifyRes = await fetch(
      'https://control.msg91.com/api/v5/widget/verifyAccessToken',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'authkey': apiKey,
        },
        body: JSON.stringify({ 'access-token': accessToken }),
      }
    )

    if (!verifyRes.ok) {
      const errData = await verifyRes.json().catch(() => ({}))
      return NextResponse.json(
        { error: errData.message || 'Token verification failed' },
        { status: 401 }
      )
    }

    const verifyData = await verifyRes.json()
    const phone = verifyData.number || verifyData.mobile || verifyData.phone

    if (!phone) {
      return NextResponse.json({ error: 'Could not get phone number from MSG91' }, { status: 500 })
    }

    const formattedPhone = phone.startsWith('91') ? phone : `91${phone.replace(/\D/g, '').slice(-10)}`

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { data: existingUser } = await supabase
      .from('users')
      .select('id, phone')
      .eq('phone', formattedPhone)
      .maybeSingle()

    let userId: string
    let existingTenantId: string | undefined

    if (existingUser) {
      userId = existingUser.id
      const sessions = Array.from(sessionStore.values()).filter((s) => s.userId === userId)
      existingTenantId = sessions.find((s) => s.tenantId)?.tenantId || undefined
    } else {
      const { data: newUser } = await supabase
        .from('users')
        .insert({ phone: formattedPhone })
        .select('id')
        .maybeSingle()

      userId = newUser?.id || `user_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`

      if (!newUser) {
        await supabase.from('users').upsert([{ id: userId, phone: formattedPhone }])
      }
    }

    const sessionId = crypto.randomBytes(32).toString('hex')
    sessionStore.set(sessionId, {
      userId,
      phone: formattedPhone,
      tenantId: existingTenantId || null,
      isPaid: false,
      createdAt: Date.now(),
    })

    const accessTokenJwt = createAccessToken({
      sessionId,
      userId,
      phone: formattedPhone,
      tenantId: existingTenantId,
    })
    const refreshTokenJwt = createRefreshToken({ sessionId, userId })

    const response = NextResponse.json({
      success: true,
      userId,
      phone: formattedPhone,
      redirectTo: existingTenantId ? '/dashboard' : '/onboarding',
    })
    setAuthCookies(response, accessTokenJwt, refreshTokenJwt, existingTenantId)

    return response
  } catch (error: any) {
    console.error('[VerifyOTP] Error:', error?.message || error)
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 })
  }
}