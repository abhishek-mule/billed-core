import { NextRequest, NextResponse } from 'next/server'
import { getVerifiedTenantIdFromRequest } from '@/lib/billzo/auth-jwt'
import { verifyRequest } from '@/lib/billzo/api-middleware'
import { getCookie } from '@/lib/cookies'

const GUPSHUP_EMBEDDED_SIGNUP_URL = process.env.GUPSHUP_EMBEDDED_SIGNUP_URL || 'https://api.gupshup.io/partner/app/onboarding/start'
const GUPSHUP_PARTNER_ID = process.env.GUPSHUP_PARTNER_ID
const GUPSHUP_API_KEY = process.env.GUPSHUP_API_KEY

export async function POST(request: NextRequest) {
  try {
    const tenantId = getVerifiedTenantIdFromRequest(request)
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!GUPSHUP_PARTNER_ID || !GUPSHUP_API_KEY) {
      console.error('[WhatsAppConnect] Missing Gupshup credentials')
      return NextResponse.json({ error: 'WhatsApp integration not configured' }, { status: 503 })
    }

    const body = await request.json().catch(() => ({}))
    const { phoneNumber, displayName } = body

    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/whatsapp/callback`

    const params = new URLSearchParams({
      partner_id: GUPSHUP_PARTNER_ID,
      redirect_uri: redirectUri,
      state: `tenant:${tenantId}`,
      phone_number: phoneNumber || '',
      display_name: displayName || '',
      coexistence: 'true',
      mode: 'coexistence',
    })

    const signupUrl = `${GUPSHUP_EMBEDDED_SIGNUP_URL}?${params.toString()}`

    return NextResponse.json({
      success: true,
      signupUrl,
      message: 'Redirect to Gupshup Embedded Signup to connect your WhatsApp Business number',
    })
  } catch (error: any) {
    console.error('[WhatsAppConnect] Error:', error)
    return NextResponse.json({ error: error.message || 'Failed to initiate WhatsApp connection' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const tenantId = getVerifiedTenantIdFromRequest(request)
  if (!tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!GUPSHUP_PARTNER_ID || !GUPSHUP_API_KEY) {
    return NextResponse.json({ configured: false, error: 'Gupshup not configured' })
  }

  return NextResponse.json({ configured: true })
}