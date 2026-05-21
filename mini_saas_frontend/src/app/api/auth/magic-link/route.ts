import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // Keep the redirect aligned with the callback route and the Supabase allowlist.
    // The callback can handle both token_hash links and code-based exchanges.
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
