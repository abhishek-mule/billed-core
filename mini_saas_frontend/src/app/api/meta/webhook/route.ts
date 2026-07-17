import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'

export const dynamic = 'force-dynamic'

const VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN || 'billzo_meta_verify_2024'

// GET — Webhook verification (Meta sends this during setup)
export async function GET(request: NextRequest) {
  const url = request.url
  const rawQuery = request.nextUrl.search
  const mode = request.nextUrl.searchParams.get('hub.mode')
  const token = request.nextUrl.searchParams.get('hub.verify_token')
  const challenge = request.nextUrl.searchParams.get('hub.challenge')

  // Also try reading from the raw query string
  const rawParams = new URLSearchParams(rawQuery)
  const rawMode = rawParams.get('hub.mode')
  const rawToken = rawParams.get('hub.verify_token')
  const rawChallenge = rawParams.get('hub.challenge')

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('[MetaWebhook] Verified successfully', { url })
    return new Response(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    })
  }

  console.warn('[MetaWebhook] Verification failed', { mode, token, url, rawQuery })
  return new Response(
    `Verification failed.
mode=${mode}
token=${token}
challenge=${challenge}
expected_token=${VERIFY_TOKEN}
raw_query=${rawQuery}
url=${url}
method=GET
raw_mode=${rawMode}
raw_token=${rawToken}
raw_challenge=${rawChallenge}`,
    { status: 403, headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
  )
}

// POST — Meta may send verification via POST as well
export async function POST(request: NextRequest) {
  // Check if this is a verification request (form-encoded body)
  const contentType = request.headers.get('content-type') || ''
  if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
    const formData = await request.formData()
    const mode = formData.get('hub.mode')
    const token = formData.get('hub.verify_token')
    const challenge = formData.get('hub.challenge')

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('[MetaWebhook] Verified via POST', { mode, token })
      return new Response(challenge as string, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      })
    }

    return new Response(
      `Verification failed (POST form).
mode=${mode}
token=${token}
challenge=${challenge}
expected_token=${VERIFY_TOKEN}`,
      { status: 403, headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
    )
  }

  // Also try raw JSON body for verification
  try {
    const body = await request.json()
    if (body?.hub?.mode === 'subscribe' && body?.hub?.verify_token === VERIFY_TOKEN) {
      const challenge = body?.hub?.challenge
      if (challenge) {
        console.log('[MetaWebhook] Verified via JSON POST', body)
        return new Response(String(challenge), { status: 200, headers: { 'Content-Type': 'text/plain' } })
      }
    }
  } catch {
    // Not JSON or not a verification request — proceed as normal message
  }

  // Normal message/status POST handling
  try {
  try {
    const body = await request.json()
    const entries = body?.entry

    if (!entries || !Array.isArray(entries)) {
      return NextResponse.json({ status: 'ok' })
    }

    for (const entry of entries) {
      const changes = entry?.changes || []
      for (const change of changes) {
        const value = change?.value
        if (!value) continue

        const phoneNumberId = value.metadata?.phone_number_id
        if (!phoneNumberId) continue

        // Process status updates
        const statuses = value.statuses || []
        for (const status of statuses) {
          await handleStatusUpdate(phoneNumberId, status)
        }

        // Process inbound messages
        const messages = value.messages || []
        for (const msg of messages) {
          await handleInboundMessage(phoneNumberId, msg)
        }
      }
    }

    return NextResponse.json({ status: 'ok' })
  } catch (err: any) {
    console.error('[MetaWebhook] Error:', err.message)
    return NextResponse.json({ status: 'ok' }) // Always return 200 to Meta
  }
}

async function handleStatusUpdate(phoneNumberId: string, status: any) {
  const { error } = await supabaseAdmin
    .from('whatsapp_events')
    .upsert({
      id: status.id,
      provider_message_id: status.id,
      status: mapMetaStatus(status.status),
      recipient_id: status.recipient_id,
      occurred_at: new Date(Number(status.timestamp) * 1000).toISOString(),
      errors: status.errors ? JSON.stringify(status.errors) : null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'provider_message_id' })

  if (error) {
    console.error('[MetaWebhook] Failed to record status:', error.message)
  }
}

async function handleInboundMessage(phoneNumberId: string, msg: any) {
  const { error } = await supabaseAdmin
    .from('whatsapp_events')
    .insert({
      provider_message_id: msg.id,
      from_number: msg.from,
      message_type: msg.type || 'unknown',
      message_body: msg.text?.body || null,
      direction: 'inbound',
      status: 'received',
      occurred_at: new Date(Number(msg.timestamp) * 1000).toISOString(),
      created_at: new Date().toISOString(),
    })

  if (error) {
    console.error('[MetaWebhook] Failed to record inbound:', error.message)
  }
}

function mapMetaStatus(status: string): string {
  switch (status) {
    case 'sent': return 'sent'
    case 'delivered': return 'delivered'
    case 'read': return 'read'
    case 'failed': return 'failed'
    case 'pending': return 'pending'
    case 'warning': return 'warning'
    default: return status
  }
}
