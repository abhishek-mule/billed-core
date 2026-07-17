import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qdnmuoyqpqdewepzuezp.supabase.co'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

async function insertEvent(payload: Record<string, any>) {
  if (!SERVICE_ROLE_KEY) {
    console.error('[MetaWebhook] SUPABASE_SERVICE_ROLE_KEY not set')
    return
  }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/whatsapp_events`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const body = await res.text()
    console.error('[MetaWebhook] DB insert failed:', res.status, body)
  }
}

async function upsertEvent(payload: Record<string, any>) {
  if (!SERVICE_ROLE_KEY) {
    const msg = 'SUPABASE_SERVICE_ROLE_KEY not set'
    console.error('[MetaWebhook] ' + msg)
    throw new Error(msg)
  }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/whatsapp_events`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(payload),
  })
  if (res.status === 409) {
    // Conflict — update existing row
    const id = payload.id
    const updateRes = await fetch(`${SUPABASE_URL}/rest/v1/whatsapp_events?id=eq.${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify(payload),
    })
    if (!updateRes.ok) {
      const body = await updateRes.text()
      throw new Error(`DB update failed (${updateRes.status}): ${body}`)
    }
    return
  }
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`DB upsert failed (${res.status}): ${body}`)
  }
}

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
  const hasKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY
  const keyPreview = hasKey ? process.env.SUPABASE_SERVICE_ROLE_KEY!.substring(0, 20) + '...' : 'MISSING'
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
raw_challenge=${rawChallenge}
has_svc_key=${hasKey}
key_preview=${keyPreview}`,
    { status: 403, headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
  )
}

// POST — Incoming messages, status updates, and form-encoded verification
export async function POST(request: NextRequest) {
  const contentType = request.headers.get('content-type') || ''

  // Form-encoded verification (some Meta flows use this)
  if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
    const formData = await request.formData()
    const mode = formData.get('hub.mode')
    const token = formData.get('hub.verify_token')
    const challenge = formData.get('hub.challenge')

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('[MetaWebhook] Verified via POST form', { mode, token })
      return new Response(challenge as string, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      })
    }

    return new Response(
      `Verification failed (POST form).\nmode=${mode}\ntoken=${token}\nchallenge=${challenge}\nexpected_token=${VERIFY_TOKEN}`,
      { status: 403, headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
    )
  }

  // JSON body — either webhook event or JSON verification request
  try {
    const body = await request.json()

    // Check for JSON-based verification (legacy/alternate flow)
    if (body?.hub?.mode === 'subscribe' && body?.hub?.verify_token === VERIFY_TOKEN) {
      const challenge = body?.hub?.challenge
      if (challenge) {
        console.log('[MetaWebhook] Verified via JSON POST', body)
        return new Response(String(challenge), { status: 200, headers: { 'Content-Type': 'text/plain' } })
      }
    }

    // Normal webhook event
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

        const statuses = value.statuses || []
        for (const status of statuses) {
          await handleStatusUpdate(phoneNumberId, status)
        }

        const messages = value.messages || []
        for (const msg of messages) {
          await handleInboundMessage(phoneNumberId, msg)
        }
      }
    }

    return NextResponse.json({ status: 'ok', result: 'processed' })
  } catch (err: any) {
    console.error('[MetaWebhook] Error:', err.message)
    return NextResponse.json({ status: 'ok', error: err.message })
  }
}

async function handleStatusUpdate(phoneNumberId: string, status: any) {
  await upsertEvent({
    id: status.id,
    provider_message_id: status.id,
    status: mapMetaStatus(status.status),
    phone: status.recipient_id,
    occurred_at: new Date(Number(status.timestamp) * 1000).toISOString(),
    error: status.errors ? JSON.stringify(status.errors) : null,
    updated_at: new Date().toISOString(),
  })
}

async function handleInboundMessage(phoneNumberId: string, msg: any) {
  await insertEvent({
    id: msg.id,
    provider_message_id: msg.id,
    phone: msg.from,
    message_type: msg.type || 'unknown',
    message_preview: msg.text?.body || null,
    direction: 'inbound',
    status: 'received',
    occurred_at: new Date(Number(msg.timestamp) * 1000).toISOString(),
  })
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
