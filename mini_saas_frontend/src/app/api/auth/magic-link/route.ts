import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkMagicLinkRateLimit, incrementMagicLinkCounters, recordLoginEvent } from '@/lib/billzo/auth-store'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY

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

    // Rate limiting (graceful degradation if Redis unavailable)
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
               request.headers.get('x-real-ip') ||
               '127.0.0.1'

    try {
      const rateCheck = await checkMagicLinkRateLimit(email, ip)
      if (!rateCheck.allowed) {
        return NextResponse.json({ error: rateCheck.reason }, { status: 429 })
      }
      await incrementMagicLinkCounters(email, ip)
    } catch (rateErr) {
      console.error('[MagicLink] Rate limiter unavailable, proceeding:', rateErr)
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const redirectTo = `${request.nextUrl.origin}/auth/callback`
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    })

    // Record login event attempt
    const userAgent = request.headers.get('user-agent') || undefined
    await recordLoginEvent({ email, ip, userAgent, success: !error })

    // Generic response — never reveal whether email is registered
    return NextResponse.json({
      success: true,
      message: 'If an account exists, we have sent a login link.'
    })
  } catch (err: any) {
    const msg = err?.message || String(err)
    console.error('[MagicLink] Catch error:', msg)
    if (msg.includes('login_events') || msg.includes('relation') || msg.includes('does not exist')) {
      console.error('[MagicLink] Database table missing — run migrations')
    }
    if (msg.includes('connect') || msg.includes('ECONNREFUSED') || msg.includes('Redis')) {
      console.error('[MagicLink] Redis/Upstash connection issue')
    }
    return NextResponse.json({ error: 'Failed to send magic link' }, { status: 500 })
  }
}