import { NextRequest, NextResponse } from 'next/server'
import { upsertWhatsAppConnection, recordPilotEvent } from '@/lib/billzo/whatsapp-server'

export const dynamic = 'force-dynamic'

const GUPSHUP_TOKEN_URL = process.env.GUPSHUP_TOKEN_URL || 'https://api.gupshup.io/partner/app/onboarding/token'
const GUPSHUP_PARTNER_ID = process.env.GUPSHUP_PARTNER_ID
const GUPSHUP_API_KEY = process.env.GUPSHUP_API_KEY

/**
 * Gupshup Embedded Signup callback (migration 090).
 *
 * Exchanges the OAuth code, then persists the connection SERVER-SIDE in
 * whatsapp_connections — the only tenant <-> phone mapping the webhook trusts.
 * Dexie is UI cache only and is never written here.
 *
 * No access tokens are persisted: sending uses partner-level auth + the
 * stored phone_number_id. If a per-tenant token is ever required, it must be
 * encrypted at rest — that decision is deliberately deferred.
 */
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

  // state carries tenantId through the provider round-trip. It is bound to the
  // connect flow (not to inbound events) — inbound events NEVER trust it.
  const [stateKind, tenantId] = state.split(':')
  if (stateKind !== 'tenant' || !tenantId) {
    return NextResponse.redirect(`${redirectBase}?error=${encodeURIComponent('Invalid state')}`)
  }

  try {
    const tokenResponse = await fetch(GUPSHUP_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        partner_id: GUPSHUP_PARTNER_ID,
        partner_api_key: GUPSHUP_API_KEY,
        code,
      }),
    })

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json().catch(() => ({}))
      console.error('[WhatsAppCallback] Token exchange failed:', errorData)
      await recordPilotEvent({
        tenantId,
        eventKind: 'webhook_error',
        providerEventType: 'connect_token_exchange',
        providerErrorCode: String(tokenResponse.status),
        providerErrorMessage: String(errorData?.message || 'token exchange failed').slice(0, 500),
      })
      return NextResponse.redirect(`${redirectBase}?error=${encodeURIComponent('Failed to exchange code for token')}`)
    }

    const tokenData = await tokenResponse.json()
    const { waba_id, phone_number_id, display_name, phone_number } = tokenData

    if (!waba_id || !phone_number_id) {
      console.error('[WhatsAppCallback] Missing WABA/phone ids in provider response')
      await recordPilotEvent({
        tenantId,
        eventKind: 'webhook_error',
        providerEventType: 'connect_missing_identifiers',
        providerErrorMessage: 'provider response missing waba_id or phone_number_id',
        rawPayload: { keys: Object.keys(tokenData || {}) },
      })
      return NextResponse.redirect(`${redirectBase}?error=${encodeURIComponent('Invalid response from Gupshup')}`)
    }

    const connection = await upsertWhatsAppConnection({
      tenantId,
      wabaId: waba_id,
      phoneNumberId: phone_number_id,
      displayName: display_name || phone_number || null,
      status: 'connected',
    })

    if (!connection) {
      await recordPilotEvent({
        tenantId,
        eventKind: 'webhook_error',
        providerEventType: 'connect_persist_failed',
        providerErrorMessage: 'whatsapp_connections upsert failed',
      })
      return NextResponse.redirect(`${redirectBase}?error=${encodeURIComponent('Could not save connection')}`)
    }

    await recordPilotEvent({
      tenantId,
      phoneNumberId: phone_number_id,
      eventKind: 'connect',
      direction: 'internal',
      providerEventType: 'embedded_signup',
      attributionResult: 'resolved',
      stateAfter: { status: 'connected', wabaId: waba_id, displayName: display_name || null },
    })

    return NextResponse.redirect(`${redirectBase}?connected=true&phone=${encodeURIComponent(phone_number || '')}`)
  } catch (error: any) {
    console.error('[WhatsAppCallback] Error:', error)
    return NextResponse.redirect(`${redirectBase}?error=${encodeURIComponent(error.message || 'Connection failed')}`)
  }
}
