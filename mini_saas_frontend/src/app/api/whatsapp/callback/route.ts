import { NextRequest, NextResponse } from 'next/server'
import { getCookie } from '@/lib/cookies'
import { createWhatsAppConnection, setWhatsAppConnectionStatus } from '@/lib/billzo/whatsapp-connection'
import { uuid } from '@/lib/billzo/db'

const GUPSHUP_TOKEN_URL = process.env.GUPSHUP_TOKEN_URL || 'https://api.gupshup.io/partner/app/onboarding/token'
const GUPSHUP_API_URL = process.env.GUPSHUP_API_URL || 'https://api.gupshup.io'
const GUPSHUP_PARTNER_ID = process.env.GUPSHUP_PARTNER_ID
const GUPSHUP_API_KEY = process.env.GUPSHUP_API_KEY

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')
  const errorDescription = searchParams.get('error_description')

  const redirectBase = `${process.env.NEXT_PUBLIC_APP_URL}/settings/whatsapp`

  if (error) {
    console.error('[WhatsAppCallback] Gupshup error:', error, errorDescription)
    return NextResponse.redirect(`${redirectBase}?error=${encodeURIComponent(errorDescription || error)}`)
  }

  if (!code || !state) {
    return NextResponse.redirect(`${redirectBase}?error=${encodeURIComponent('Missing code or state')}`)
  }

  const stateParts = state.split(':')
  if (stateParts[0] !== 'tenant' || !stateParts[1]) {
    return NextResponse.redirect(`${redirectBase}?error=${encodeURIComponent('Invalid state')}`)
  }
  const tenantId = stateParts[1]

  try {
    const tokenResponse = await fetch(GUPSHUP_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        partner_id: GUPSHUP_PARTNER_ID,
        partner_api_key: GUPSHUP_API_KEY,
        code,
      }),
    })

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json().catch(() => ({}))
      console.error('[WhatsAppCallback] Token exchange failed:', errorData)
      return NextResponse.redirect(`${redirectBase}?error=${encodeURIComponent('Failed to exchange code for token')}`)
    }

    const tokenData = await tokenResponse.json()
    const { access_token, expires_in, waba_id, phone_number_id, display_name, phone_number } = tokenData

    if (!waba_id || !phone_number_id) {
      console.error('[WhatsAppCallback] Missing WABA ID or Phone Number ID:', tokenData)
      return NextResponse.redirect(`${redirectBase}?error=${encodeURIComponent('Invalid response from Gupshup')}`)
    }

    const { createWhatsAppConnection, setWhatsAppConnectionStatus } = await import('@/lib/billzo/whatsapp-connection')

    const existing = await (await import('@/lib/billzo/whatsapp-connection')).getWhatsAppConnectionByPhoneNumberId(phone_number_id)
    if (existing) {
      await (await import('@/lib/billzo/whatsapp-connection')).updateWhatsAppConnection(existing.id, {
        wabaId: waba_id,
        displayName: display_name || '',
        connectionStatus: 'connected',
        accessToken: access_token,
        expiresAt: expires_in ? new Date(Date.now() + expires_in * 1000).toISOString() : undefined,
      })
    } else {
      await createWhatsAppConnection({
        tenantId: stateParts[1],
        wabaId: waba_id,
        phoneNumberId: phone_number_id,
        displayName: display_name || '',
        accessToken: access_token,
        expiresAt: expires_in ? new Date(Date.now() + expires_in * 1000).toISOString() : undefined,
      })
    }

    return NextResponse.redirect(`${redirectBase}?connected=true&phone=${encodeURIComponent(phone_number || '')}`)
  } catch (error: any) {
    console.error('[WhatsAppCallback] Error:', error)
    return NextResponse.redirect(`${redirectBase}?error=${encodeURIComponent(error.message || 'Connection failed')}`)
  }
}