import { createServerClient, parseCookieHeader, serializeCookieHeader } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  try {
    // Check if required env vars are set
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseKey) {
      console.error('Supabase environment variables not configured')
      return NextResponse.redirect(new URL('/login?error=config', request.url))
    }

    if (code) {
      const supabase = createServerClient(
        supabaseUrl,
        supabaseKey,
        {
          cookies: {
            get(name: string) {
              return request.cookies.get(name)?.value
            },
            set(name: string, value: string, options: any) {
              // This will be handled by the redirect response
            },
            remove(name: string, options: any) {
              // This will be handled by the redirect response
            },
          },
        }
      )

      const { data, error } = await supabase.auth.exchangeCodeForSession(code)

      if (!error && data.session) {
        // Create redirect response
        const redirectUrl = new URL(next, request.url)
        const response = NextResponse.redirect(redirectUrl)

        // Set the session cookies manually
        if (data.session.access_token) {
          response.cookies.set('sb-access-token', data.session.access_token, {
            path: '/',
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: data.session.expires_in || 3600,
          })
        }

        if (data.session.refresh_token) {
          response.cookies.set('sb-refresh-token', data.session.refresh_token, {
            path: '/',
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 60 * 60 * 24 * 30, // 30 days
          })
        }

        return response
      } else {
        console.error('Failed to exchange code for session:', error)
      }
    }

    // No code or error - redirect to login with error
    return NextResponse.redirect(new URL('/login?error=auth', request.url))
  } catch (err) {
    console.error('Auth callback error:', err)
    return NextResponse.redirect(new URL('/login?error=server', request.url))
  }
}