import crypto from 'crypto'
import fs from 'fs'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const WEBHOOK_LOG_FILE = process.env.META_WEBHOOK_LOG_FILE || '/tmp/opencode/meta-webhook.log'

function appendWebhookLog(line: string) {
  try {
    const ts = new Date().toISOString()
    fs.appendFileSync(WEBHOOK_LOG_FILE, `${ts} ${line}\n`)
  } catch {
    // noop
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qdnmuoyqpqdewepzuezp.supabase.co'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN || 'billzo_meta_verify_2024'

async function supabaseFetch(path: string, options: RequestInit = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    ...(options.headers as Record<string, string> || {}),
  }
  const res = await fetch(url, { ...options, headers })
  return res
}

async function writeDeadLetter(reason: string, payload: any, webhookBody?: any) {
  try {
    await supabaseFetch('dead_letter_events', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        reason,
        provider: 'meta',
        payload: payload || {},
        webhook_body: webhookBody || null,
      }),
    })
  } catch (err: any) {
    console.error('[MetaWebhook] Failed to write dead letter:', err.message)
  }
}

function buildMetadata(opts: {
  webhookId: string
  billzoMessageId: string | null
  providerMessageId: string | null
  providerPhoneNumberId: string | null
  providerWabaId: string | null
  rawStatus: string | null
  normalizedStatus: string
  conversation: any | null
  pricing: any | null
  rawPayload: any
  processing: Record<string, any>
}): Record<string, any> {
  return {
    trace: {
      webhook_id: opts.webhookId,
      billzo_message_id: opts.billzoMessageId,
      provider_message_id: opts.providerMessageId,
    },
    provider: {
      phone_number_id: opts.providerPhoneNumberId,
      waba_id: opts.providerWabaId,
      raw_status: opts.rawStatus,
    },
    normalized: {
      status: opts.normalizedStatus,
      conversation: opts.conversation,
      pricing: opts.pricing,
    },
    raw: opts.rawPayload,
    processing: opts.processing,
  }
}

// GET — Webhook verification (Meta sends this during setup)
export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get('hub.mode')
  const token = request.nextUrl.searchParams.get('hub.verify_token')
  const challenge = request.nextUrl.searchParams.get('hub.challenge')

  appendWebhookLog(`GET verification mode=${mode} token=${token} challenge=${challenge}`)

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    appendWebhookLog('GET verification SUCCESS - echoing challenge')
    return new Response(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    })
  }

  return new Response(
    `Verification failed. mode=${mode} token=${token}`,
    { status: 403, headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
  )
}

// POST — Incoming messages and status updates
export async function POST(request: NextRequest) {
  const contentType = request.headers.get('content-type') || ''
  const signature256 = request.headers.get('x-hub-signature-256')
  const bodyText = await request.text()

  const appSecret = process.env.META_APP_SECRET
  if (appSecret) {
    let signature = signature256
    if (signature?.startsWith('sha256=')) {
      signature = signature.substring(7)
    }
    const { validateWebhookSignature } = await import('@/lib/billzo/api-middleware')
    if (!signature || !validateWebhookSignature(bodyText, signature, appSecret)) {
      appendWebhookLog('POST signature verification failed')
      return new Response('Invalid signature', { status: 401 })
    }
  }

  // Form-encoded verification (some Meta flows use this)
  if (contentType.includes('application/x-www-form-urlencoded')) {
    const params = new URLSearchParams(bodyText)
    const mode = params.get('hub.mode')
    const token = params.get('hub.verify_token')
    const challenge = params.get('hub.challenge')

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      return new Response(challenge as string, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      })
    }

    return new Response(
      `Verification failed (POST form). mode=${mode}`,
      { status: 403, headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
    )
  }

  // JSON body
  let body: any
  try {
    body = JSON.parse(bodyText)
  } catch (parseErr: any) {
    appendWebhookLog('POST invalid JSON body')
    return NextResponse.json({ status: 'ok', error: 'invalid json' })
  }

  appendWebhookLog(`POST received object=${body?.object} entry_count=${Array.isArray(body?.entry) ? body.entry.length : '?'}`)

  // JSON-based verification
  if (body?.hub?.mode === 'subscribe' && body?.hub?.verify_token === VERIFY_TOKEN) {
    const challenge = body?.hub?.challenge
    if (challenge) {
      return new Response(String(challenge), { status: 200, headers: { 'Content-Type': 'text/plain' } })
    }
  }

  const webhookId = crypto.randomUUID()

  try {
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
          appendWebhookLog(`POST status id=${status.id} status=${status.status} recipient=${status.recipient_id}`)
          await handleStatusUpdate(webhookId, phoneNumberId, value, status)
        }

        const messages = value.messages || []
        for (const msg of messages) {
          appendWebhookLog(`POST message id=${msg.id} from=${msg.from} type=${msg.type}`)
          await handleInboundMessage(webhookId, phoneNumberId, value, msg)
        }
      }
    }

    return NextResponse.json({ status: 'ok', result: 'processed' })
  } catch (err: any) {
    appendWebhookLog(`POST processing ERROR: ${err.message}`)
    console.error('[MetaWebhook] Processing failed:', err.message)
    await writeDeadLetter(err.message.slice(0, 500), { error: err.message, webhookId }, body)
    return NextResponse.json({ status: 'ok', error: err.message })
  }
}

async function writeOutboxEvent(payload: {
  type: string
  tenantId: string
  entityId: string | null
  payload: Record<string, unknown>
  correlationId: string
}) {
  try {
    await supabaseFetch('outbox', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        type: payload.type,
        tenant_id: payload.tenantId,
        entity_id: payload.entityId,
        payload: payload.payload,
        causation_id: null,
        correlation_id: payload.correlationId,
        idempotency_key: null,
        version: 1,
        status: 'pending',
        next_attempt_at: new Date().toISOString(),
        attempts: 0,
      }),
    })
  } catch (err: any) {
    console.error('[MetaWebhook] Outbox write failed:', err.message)
  }
}

async function resolveWebhookContext(providerMessageId: string, phone: string) {
  // Look up the original send record by provider_message_id
  const res = await supabaseFetch(
    `whatsapp_events?select=id,billzo_message_id,invoice_id,tenant_id&provider_message_id=eq.${encodeURIComponent(providerMessageId)}&order=created_at.desc&limit=1`,
    { method: 'GET' },
  )
  if (res.ok) {
    const rows = await res.json()
    if (rows && rows.length > 0) {
      return rows[0] as { id: string; billzo_message_id: string; invoice_id: string | null; tenant_id: string }
    }
  }
  return null
}

async function handleStatusUpdate(webhookId: string, phoneNumberId: string, value: any, status: any) {
  const providerMessageId = status.id
  const phone = status.recipient_id
  const rawMetaStatus = status.status
  const occurredAt = new Date(Number(status.timestamp) * 1000).toISOString()
  const now = new Date().toISOString()

  const resolved = await resolveWebhookContext(providerMessageId, phone)

  const billzoMessageId = resolved?.billzo_message_id || null
  const invoiceId = resolved?.invoice_id || null
  const tenantId = resolved?.tenant_id || 'meta_webhook'
  const eventId = crypto.randomUUID()

  const normalizedStatus = mapMetaStatus(rawMetaStatus)
  const conversation = status.conversation || null
  const pricing = status.pricing || null

  const metadata = buildMetadata({
    webhookId,
    billzoMessageId,
    providerMessageId,
    providerPhoneNumberId: phoneNumberId,
    providerWabaId: value.metadata?.waba_id || null,
    rawStatus: rawMetaStatus,
    normalizedStatus,
    conversation,
    pricing,
    rawPayload: { statuses: [status], metadata: value.metadata },
    processing: {
      resolved_invoice_id: invoiceId,
      resolved_from_event_id: resolved?.id || null,
    },
  })

  const row = {
    id: eventId,
    tenant_id: tenantId,
    billzo_message_id: billzoMessageId,
    provider_message_id: providerMessageId,
    phone,
    status: normalizedStatus,
    direction: 'outbound',
    invoice_id: invoiceId,
    occurred_at: occurredAt,
    metadata,
    conversation_id: conversation?.id || null,
    errors: status.errors ? JSON.stringify(status.errors) : null,
    created_at: now,
  }

  const insertRes = await supabaseFetch('whatsapp_events', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(row),
  })

  if (!insertRes.ok) {
    const text = await insertRes.text()
    console.error('[MetaWebhook] whatsapp_events insert failed:', insertRes.status, text)
    await writeDeadLetter(
      `whatsapp_events insert failed: ${insertRes.status}`,
      { row, error: text, webhookId },
    )
    return
  }

  // Emit message.event to outbox (only for status changes we care about)
  if (billzoMessageId && tenantId !== 'meta_webhook') {
    const outboxPayload: Record<string, unknown> = {
      channel: 'whatsapp',
      provider: 'meta',
      status: normalizedStatus,
      billzo_message_id: billzoMessageId,
      provider_message_id: providerMessageId,
      occurred_at: occurredAt,
      conversation,
      pricing,
    }

    await writeOutboxEvent({
      type: 'message.event',
      tenantId,
      entityId: invoiceId,
      payload: outboxPayload,
      correlationId: webhookId,
    })
  }
}

/**
 * Normalise an inbound WhatsApp sender number to the same format used in
 * `customers.phone`. Meta sends numbers with country code, no '+' or spaces
 * (e.g. "919876543210"). We want to match against however the merchant saved
 * the number — with or without 91, with or without leading zero.
 */
function normalisePhone(raw: string): string[] {
  const digits = raw.replace(/\D/g, '')
  const candidates: string[] = [digits]

  // Strip leading 91 (India) → local 10-digit
  if (digits.startsWith('91') && digits.length === 12) {
    candidates.push(digits.slice(2))
  }
  // Prepend 91 to 10-digit local number
  if (digits.length === 10) {
    candidates.push('91' + digits)
    // Some merchants save with a leading 0
    candidates.push('0' + digits)
  }
  // Handle numbers saved with + prefix
  candidates.push('+' + digits)
  return [...new Set(candidates)]
}

async function handleInboundMessage(webhookId: string, phoneNumberId: string, value: any, msg: any) {
  const now = new Date().toISOString()
  const eventId = crypto.randomUUID()
  const occurredAt = new Date(Number(msg.timestamp) * 1000).toISOString()
  const senderRaw: string = msg.from || ''

  // ── 1. Resolve tenant + customer from sender phone ────────────────────
  let resolvedTenantId: string | null = null
  let resolvedCustomerId: string | null = null
  let resolvedInvoiceId: string | null = null

  if (senderRaw) {
    const phoneCandidates = normalisePhone(senderRaw)

    // Try to match against any of the candidate formats in customers table
    for (const candidate of phoneCandidates) {
      const res = await supabaseFetch(
        `customers?phone=eq.${encodeURIComponent(candidate)}&select=id,tenant_id&limit=1`,
        { method: 'GET' },
      )
      if (res.ok) {
        const rows: any[] = await res.json().catch(() => [])
        if (rows.length > 0) {
          resolvedCustomerId = rows[0].id
          resolvedTenantId = rows[0].tenant_id
          break
        }
      }
    }

    // If we resolved a customer, find the most-recent open invoice (for correlation)
    if (resolvedTenantId && resolvedCustomerId) {
      const invRes = await supabaseFetch(
        `invoices?customer_id=eq.${resolvedCustomerId}&tenant_id=eq.${resolvedTenantId}&status=neq.paid&order=created_at.desc&limit=1&select=id`,
        { method: 'GET' },
      )
      if (invRes.ok) {
        const invRows: any[] = await invRes.json().catch(() => [])
        if (invRows.length > 0) resolvedInvoiceId = invRows[0].id
      }
    }
  }

  // ── 2. Build metadata ─────────────────────────────────────────────────
  const metadata = buildMetadata({
    webhookId,
    billzoMessageId: null,
    providerMessageId: msg.id,
    providerPhoneNumberId: phoneNumberId,
    providerWabaId: value.metadata?.waba_id || null,
    rawStatus: 'received',
    normalizedStatus: 'received',
    conversation: null,
    pricing: null,
    rawPayload: { messages: [msg], metadata: value.metadata },
    processing: {
      resolved_tenant_id: resolvedTenantId,
      resolved_customer_id: resolvedCustomerId,
      resolved_invoice_id: resolvedInvoiceId,
    },
  })

  // ── 3. Insert whatsapp_events with real tenant_id ─────────────────────
  const row = {
    id: eventId,
    tenant_id: resolvedTenantId || 'meta_webhook', // sentinel for unresolved
    provider_message_id: msg.id,
    phone: senderRaw,
    message_type: msg.type || 'unknown',
    message_preview: msg.text?.body?.slice(0, 500) || null,
    direction: 'inbound',
    status: 'received',
    occurred_at: occurredAt,
    metadata,
    created_at: now,
  }

  const insertRes = await supabaseFetch('whatsapp_events', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(row),
  })

  if (!insertRes.ok) {
    const text = await insertRes.text()
    console.error('[MetaWebhook] whatsapp_events inbound insert failed:', insertRes.status, text)
    await writeDeadLetter(
      `whatsapp_events inbound insert failed: ${insertRes.status}`,
      { row, error: text, webhookId },
    )
    return
  }

  // ── 4. Emit outbox event for matched senders only ─────────────────────
  if (resolvedTenantId && resolvedCustomerId) {
    try {
      const { writeOutboxEvent } = await import('@/lib/billzo/outbox')
      await writeOutboxEvent({
        type: 'customer.reply',
        tenantId: resolvedTenantId,
        entityId: resolvedInvoiceId || resolvedCustomerId,
        payload: {
          whatsappEventId: eventId,
          customerId: resolvedCustomerId,
          invoiceId: resolvedInvoiceId,
          phone: senderRaw,
          messagePreview: msg.text?.body?.slice(0, 200) || null,
          messageType: msg.type || 'text',
          channel: 'whatsapp',
          provider: 'meta',
          occurredAt,
        },
        correlationId: webhookId,
      })
    } catch (err: any) {
      console.error('[MetaWebhook] Failed to emit customer.reply outbox event:', err.message)
    }
  } else {
    // Unmatched phone — write to dead-letter for ops visibility
    await writeDeadLetter(
      `inbound_unmatched_phone: no customer found for ${senderRaw}`,
      { senderRaw, phoneCandidates: normalisePhone(senderRaw), webhookId, eventId },
    )
    appendWebhookLog(`Inbound from unmatched phone ${senderRaw} — dead-lettered`)
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
