import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'
import { buildInboxRows, normalizePayload } from '@billzo/shared/whatsapp'

export const dynamic = 'force-dynamic'

const WEBHOOK_SECRET = process.env.GUPSHUP_WEBHOOK_SECRET

/**
 * WhatsApp webhook — durable inbox handoff (migration 100).
 *
 * Contract:
 *   authenticate -> parse -> normalizePayload -> sanitize -> Postgres upsert -> 200
 *
 * The durable boundary is the webhook_inbox table. HTTP 200 is only returned
 * AFTER the event has crossed PostgreSQL (the ON CONFLICT DO NOTHING upsert on
 * UNIQUE(provider, provider_event_id) absorbs provider retries). A failed
 * insert returns 503 so the provider retries — BillZo never acks an event it
 * has not durably received.
 *
 * This route performs NO domain writes: it never touches whatsapp_events,
 * recovery_outcomes, collection_actions, or pilot_events. Tenant resolution
 * (phone_number_id -> whatsapp_connections -> tenant_id) and all domain
 * persistence are owned by the inbox consumer that claims these rows. The
 * tenant is never guessed from customer phone, session, or request body.
 *
 * The domain layer lives in @billzo/shared/whatsapp (client-injected);
 * normalizePayload/buildInboxRows are pure and imported here. The route bound
 * client (supabaseAdmin) is used ONLY for the durable webhook_inbox upsert.
 *
 * Handles both the Meta passthrough shape (entry[].changes[].value) and the
 * flat Gupshup callback shape ({ event, data }).
 */

function verifySignature(payload: string, signature: string | null): boolean {
  if (!WEBHOOK_SECRET) return false
  if (!signature) return false
  const expected = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(payload)
    .digest('hex')
  const provided = signature.replace(/^sha256=/, '')
  const a = Buffer.from(expected)
  const b = Buffer.from(provided)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  const signature = request.headers.get('x-gupshup-signature') || request.headers.get('x-hub-signature-256')

  // Fail closed: without a configured webhook secret no signature can be
  // verified, so the endpoint rejects every payload instead of accepting
  // unsigned events.
  if (!WEBHOOK_SECRET) {
    console.warn('[WhatsAppWebhook] GUPSHUP_WEBHOOK_SECRET not configured — rejecting webhook')
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 })
  }

  if (!verifySignature(rawBody, signature)) {
    console.warn('[WhatsAppWebhook] Invalid signature')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let payload: any
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Meta webhook subscription verification (GET-style challenge may arrive as POST on setup)
  if (payload?.hub_challenge) {
    return NextResponse.json({ challenge: payload.hub_challenge })
  }

  const events = normalizePayload(payload)
  if (events.length === 0) {
    console.log('[WhatsAppWebhook] No recognizable events in payload')
    return NextResponse.json({ received: true })
  }

  // Provider identity comes from the signing header, never from the body.
  const provider = request.headers.get('x-gupshup-signature') ? 'gupshup' : 'meta'
  const rows = buildInboxRows(events, provider, payload)

  // An envelope that normalized to empty message/status arrays carries nothing
  // actionable — ack it without touching the durability boundary.
  if (rows.length === 0) {
    console.log('[WhatsAppWebhook] No actionable events in payload')
    return NextResponse.json({ received: true })
  }

  const { error } = await supabaseAdmin
    .from('webhook_inbox')
    .upsert(rows, { onConflict: 'provider,provider_event_id', ignoreDuplicates: true })

  if (error) {
    // DURABILITY BOUNDARY: nothing verifiably crossed PostgreSQL. Return
    // non-2xx so the provider retries; a duplicate on retry is absorbed by
    // uq_webhook_inbox_provider_event. Never ack what was not durably stored.
    console.error('[WhatsAppWebhook] webhook_inbox insert failed:', error?.message)
    return NextResponse.json({ error: 'Failed to persist webhook event' }, { status: 503 })
  }

  return NextResponse.json({ received: true })
}