import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import {
  resolveTenantByPhoneNumberId,
  recordPilotEvent,
} from '@/lib/billzo/whatsapp-server'
import { supabaseAdmin } from '@/lib/billzo/supabase-admin'

export const dynamic = 'force-dynamic'

const WEBHOOK_SECRET = process.env.GUPSHUP_WEBHOOK_SECRET

/**
 * WhatsApp webhook — server-authoritative tenant resolution (migration 090).
 *
 * Invariant: every event resolves tenant ONLY via
 *   phone_number_id -> whatsapp_connections -> tenant_id
 * On resolution failure the event is recorded as unattributed in pilot_events
 * and processing STOPS. The tenant is never guessed from customer phone,
 * session, or request body.
 *
 * Handles both the Meta passthrough shape (entry[].changes[].value) and the
 * flat Gupshup callback shape ({ event, data }).
 */

function verifySignature(payload: string, signature: string | null): boolean {
  if (!WEBHOOK_SECRET) return true
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

/** Strip anything credential-shaped and bound the payload size. */
function sanitizeRaw(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null
  const REDACT = /token|auth|secret|key|credential|password/i
  const walk = (v: any, depth = 0): any => {
    if (depth > 6) return '[depth]'
    if (Array.isArray(v)) return v.slice(0, 20).map((x) => walk(x, depth + 1))
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {}
      for (const [k, val] of Object.entries(v).slice(0, 40)) {
        out[k] = REDACT.test(k) ? '[redacted]' : walk(val, depth + 1)
      }
      return out
    }
    if (typeof v === 'string' && v.length > 500) return v.slice(0, 500) + '…'
    return v
  }
  try {
    const cleaned = walk(value)
    const json = JSON.stringify(cleaned)
    if (json.length <= 16000) return cleaned
    return { truncated: true, head: json.slice(0, 16000) }
  } catch {
    return null
  }
}

interface NormalizedMessage {
  id?: string
  from?: string
  to?: string
  timestamp?: string
  type?: string
  text?: string | { body?: string }
  /** Provider-parent identity: the message this inbound reply references
   *  (Meta: context.id; Gupshup: context.id). Resolves the recovery attempt
   *  this reply belongs to — never by timestamp proximity. */
  contextId?: string
}

/** Meta sends text as { body: "..." }, Gupshup sends it as a plain string. */
function textBody(text: NormalizedMessage['text']): string | null {
  if (!text) return null
  if (typeof text === 'string') return text
  if (typeof text === 'object' && typeof text.body === 'string') return text.body
  return null
}
interface NormalizedStatus {
  id?: string
  status?: string
  timestamp?: string
  recipient_id?: string
}
interface NormalizedEvent {
  eventType: 'customer_message' | 'merchant_echo' | 'status'
  phoneNumberId: string
  wabaId?: string
  messages?: NormalizedMessage[]
  statuses?: NormalizedStatus[]
}

/** Normalize Meta passthrough + flat Gupshup shapes into one internal form. */
function normalizePayload(payload: any): NormalizedEvent[] {
  const events: NormalizedEvent[] = []

  // Meta passthrough: entry[].changes[].value
  for (const entry of Array.isArray(payload?.entry) ? payload.entry : []) {
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      const value = change?.value
      const phoneNumberId = value?.metadata?.phone_number_id
      if (!phoneNumberId) continue
      if (Array.isArray(value?.messages)) {
        events.push({ eventType: 'customer_message', phoneNumberId, wabaId: entry.id, messages: value.messages })
      }
      if (Array.isArray(value?.statuses)) {
        events.push({ eventType: 'status', phoneNumberId, wabaId: entry.id, statuses: value.statuses })
      }
    }
  }

  // Flat Gupshup callback: { event, data: { phone_number_id, messages|statuses } }
  if (payload?.event && payload?.data?.phone_number_id) {
    const phoneNumberId = payload.data.phone_number_id
    const messages = Array.isArray(payload.data.messages) ? payload.data.messages : payload.data.messages ? [payload.data.messages] : []
    const statuses = Array.isArray(payload.data.statuses) ? payload.data.statuses : []
    if (payload.event === 'smb_message_echoes') {
      events.push({ eventType: 'merchant_echo', phoneNumberId, messages })
    } else if (payload.event === 'message' || payload.event === 'messages') {
      events.push({ eventType: 'customer_message', phoneNumberId, messages })
    } else if (payload.event === 'message_status' || payload.event === 'statuses') {
      events.push({ eventType: 'status', phoneNumberId, statuses })
    }
  }

  return events
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  const signature = request.headers.get('x-gupshup-signature') || request.headers.get('x-hub-signature-256')

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

  for (const ev of events) {
    try {
      await processEvent(ev, payload)
    } catch (err: any) {
      console.error('[WhatsAppWebhook] Event processing failed:', err?.message)
      await recordPilotEvent({
        phoneNumberId: ev.phoneNumberId,
        eventKind: 'webhook_error',
        providerEventType: ev.eventType,
        providerErrorMessage: String(err?.message || err).slice(0, 500),
      })
    }
  }

  // Always 200: provider retries on non-200 would storm an already-failing path.
  return NextResponse.json({ received: true })
}

async function processEvent(ev: NormalizedEvent, rawPayload: any) {
  // ── SECURITY BOUNDARY: resolve tenant strictly by phone_number_id ──
  const connection = await resolveTenantByPhoneNumberId(ev.phoneNumberId)

  if (!connection) {
    // Do NOT guess the tenant. Record the unattributed event and stop.
    console.warn('[WhatsAppWebhook] Unattributed event — unknown phone_number_id:', ev.phoneNumberId)
    await recordPilotEvent({
      phoneNumberId: ev.phoneNumberId,
      eventKind: 'unattributed_webhook',
      providerEventType: ev.eventType,
      providerMessageId: ev.messages?.[0]?.id ?? ev.statuses?.[0]?.id ?? null,
      attributionResult: 'unattributed',
      rawPayload: sanitizeRaw(ev),
    })
    return
  }

  const tenantId = connection.tenant_id

  if (ev.eventType === 'customer_message') {
    for (const msg of ev.messages ?? []) {
      const customerId = await matchCustomer(tenantId, msg.from)
      // Normalize provider parent identity (Meta: message.context.id; Gupshup: contextId).
      const normalized = { ...msg, contextId: (msg as any).context?.id ?? msg.contextId ?? null }
      await persistInboundWhatsAppEvent(tenantId, connection, normalized, customerId)
      await recordPilotEvent({
        tenantId,
        customerId,
        phoneNumberId: ev.phoneNumberId,
        eventKind: 'customer_replied',
        direction: 'inbound',
        providerMessageId: msg.id ?? null,
        providerEventType: 'message',
        providerStatus: 'received',
        attributionResult: customerId ? 'resolved' : 'customer_unmatched',
        stateAfter: { from: msg.from, type: msg.type, text: textBody(msg.text)?.slice(0, 300), repliedTo: normalized.contextId ?? null },
        rawPayload: sanitizeRaw(msg),
        occurredAt: tsToIso(msg.timestamp),
      })
    }
    return
  }

  if (ev.eventType === 'merchant_echo') {
    for (const msg of ev.messages ?? []) {
      const customerId = await matchCustomer(tenantId, msg.to)
      await persistEchoWhatsAppEvent(tenantId, connection, msg, customerId)
      await recordPilotEvent({
        tenantId,
        customerId,
        phoneNumberId: ev.phoneNumberId,
        eventKind: 'merchant_app_reply',
        direction: 'outbound',
        providerMessageId: msg.id ?? null,
        providerEventType: 'smb_message_echoes',
        providerStatus: 'sent',
        attributionResult: customerId ? 'resolved' : 'customer_unmatched',
        stateAfter: { to: msg.to, type: msg.type, text: textBody(msg.text)?.slice(0, 300) },
        rawPayload: sanitizeRaw(msg),
        occurredAt: tsToIso(msg.timestamp),
      })
    }
    return
  }

  // status events: update the domain row, then trace
  for (const st of ev.statuses ?? []) {
    await updateDeliveryStatus(tenantId, st)
    await recordPilotEvent({
      tenantId,
      phoneNumberId: ev.phoneNumberId,
      eventKind: 'message_status',
      direction: 'outbound',
      providerMessageId: st.id ?? null,
      providerEventType: 'message_status',
      providerStatus: st.status ?? null,
      stateAfter: { status: st.status, recipient: st.recipient_id },
      rawPayload: sanitizeRaw(st),
      occurredAt: tsToIso(st.timestamp),
    })
  }
}

/** Tenant-scoped customer match by phone. Never used to infer tenant. */
async function matchCustomer(tenantId: string, phone?: string): Promise<string | null> {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  const { data } = await supabaseAdmin
    .from('customers')
    .select('id')
    .eq('tenant_id', tenantId)
    .or(`phone.eq.${phone},phone.eq.${digits},phone.eq.+${digits}`)
    .limit(1)
    .maybeSingle()
  return data?.id ?? null
}

function tsToIso(ts?: string): string | undefined {
  const n = ts ? parseInt(ts) : NaN
  return Number.isFinite(n) ? new Date(n * 1000).toISOString() : undefined
}

export async function persistInboundWhatsAppEvent(
  tenantId: string,
  connection: { phone_number_id: string },
  msg: NormalizedMessage,
  customerId: string | null,
) {
  // Domain-side dedup: pilot_events dedups the trace; this keeps whatsapp_events clean too.
  if (msg.id) {
    const { data: existing } = await supabaseAdmin
      .from('whatsapp_events')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('provider_message_id', msg.id)
      .limit(1)
      .maybeSingle()
    if (existing) return
  }

  // A reply is attributed to an attempt ONLY through provider parent identity.
  // No parent / unresolvable parent ⇒ unknown causality, never a timestamp guess.
  const contextId = msg.contextId || null
  const resolved = contextId ? await resolveReplyContext(contextId) : null
  const recoveryAttemptId = resolved?.recovery_attempt_id ?? null
  const occurredAt = tsToIso(msg.timestamp) ?? new Date().toISOString()

  await supabaseAdmin.from('whatsapp_events').insert({
    id: crypto.randomUUID(),
    billzo_message_id: msg.id ?? crypto.randomUUID(),
    tenant_id: tenantId,
    customer_id: customerId,
    phone: msg.from ?? null,
    phone_number_id: connection.phone_number_id,
    direction: 'inbound',
    message_type: 'customer',
    event_layer: 'transport',
    message_origin: 'inbound_webhook',
    provider_message_id: msg.id ?? null,
    recovery_attempt_id: recoveryAttemptId,
    status: 'received',
    occurred_at: occurredAt,
    metadata: {
      type: msg.type,
      text: textBody(msg.text)?.slice(0, 500),
      context_id: contextId,
      replied_to_attempt: recoveryAttemptId ?? null,
    },
  })

  // Record the reply outcome: VERIFIED only when the parent identity resolves,
  // otherwise UNKNOWN — the honest ledger entry for an unattributed reply.
  const outcome = {
    tenant_id: tenantId,
    recovery_attempt_id: recoveryAttemptId,
    outcome_type: 'customer_replied',
    outcome_at: occurredAt,
    invoice_id: resolved?.invoice_id ?? null,
    customer_id: customerId ?? resolved?.customer_id ?? null,
    attribution_status: recoveryAttemptId ? 'verified' : 'unknown',
    attribution_method: recoveryAttemptId ? 'explicit' : null,
    confidence_score: recoveryAttemptId ? 1 : null,
    provider_message_id: msg.id ?? null,
    metadata: { replied_to: contextId, type: msg.type },
  }

  if (recoveryAttemptId) {
    await supabaseAdmin.from('recovery_outcomes').upsert(outcome, {
      onConflict: 'recovery_attempt_id,outcome_type,provider_message_id',
    })
  } else {
    await supabaseAdmin.from('recovery_outcomes').insert(outcome)
  }
}

/**
 * Resolve the recovery attempt + invoice context from a provider parent id
 * (the outbound message this reply references). Identity only:
 * whatsapp_events.provider_message_id, preferring rows that already carry the
 * attempt id, falling back to collection_actions linkage. Returns null when
 * no attempt is provable — the caller records UNKNOWN causality.
 */
async function resolveReplyContext(contextId: string): Promise<{
  recovery_attempt_id: string | null
  invoice_id: string | null
  customer_id: string | null
} | null> {
  const { data: withAttempt } = await supabaseAdmin
    .from('whatsapp_events')
    .select('recovery_attempt_id, invoice_id, customer_id')
    .eq('provider_message_id', contextId)
    .not('recovery_attempt_id', 'is', null)
    .limit(1)
    .maybeSingle()
  if (withAttempt?.recovery_attempt_id) {
    return {
      recovery_attempt_id: withAttempt.recovery_attempt_id,
      invoice_id: withAttempt.invoice_id ?? null,
      customer_id: withAttempt.customer_id ?? null,
    }
  }

  const { data: anyRow } = await supabaseAdmin
    .from('whatsapp_events')
    .select('recovery_attempt_id, invoice_id, customer_id')
    .eq('provider_message_id', contextId)
    .limit(1)
    .maybeSingle()

  const attemptId = anyRow?.recovery_attempt_id ?? (await resolveAttemptForMessageId(contextId))
  return attemptId
    ? {
        recovery_attempt_id: attemptId,
        invoice_id: anyRow?.invoice_id ?? null,
        customer_id: anyRow?.customer_id ?? null,
      }
    : null
}

export async function persistEchoWhatsAppEvent(
  tenantId: string,
  connection: { phone_number_id: string },
  msg: NormalizedMessage,
  customerId: string | null,
) {
  if (msg.id) {
    const { data: existing } = await supabaseAdmin
      .from('whatsapp_events')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('provider_message_id', msg.id)
      .limit(1)
      .maybeSingle()
    if (existing) return
  }

  // The provider echo reflects an outbound message we sent. Resolve the
  // attempt from provider identity (billzo_message_id or the provider receipt
  // stored in action metadata) so the append-only outbound row carries the
  // causal spine. No match => unknown, not guessed.
  const recoveryAttemptId = msg.id ? await resolveAttemptForMessageId(msg.id) : null

  await supabaseAdmin.from('whatsapp_events').insert({
    id: crypto.randomUUID(),
    billzo_message_id: msg.id ?? crypto.randomUUID(),
    tenant_id: tenantId,
    customer_id: customerId,
    phone: msg.to ?? null,
    phone_number_id: connection.phone_number_id,
    direction: 'outbound',
    message_type: 'merchant_app_reply',
    event_layer: 'transport',
    message_origin: 'merchant_app',
    provider_message_id: msg.id ?? null,
    recovery_attempt_id: recoveryAttemptId,
    status: 'sent',
    occurred_at: tsToIso(msg.timestamp) ?? new Date().toISOString(),
    metadata: { type: msg.type, text: textBody(msg.text)?.slice(0, 500) },
  })
}

/**
 * Resolve the recovery attempt (collection_actions.id) that produced a
 * provided message. Tries the billzo id first, then the raw provider receipt
 * stored on the attempt. Returns null when no attempt matches — the caller
 * records an unlinked (unknown) event rather than guessing causality.
 */
export async function resolveAttemptForMessageId(msgId: string): Promise<string | null> {
  const { data: byBillzoId } = await supabaseAdmin
    .from('collection_actions')
    .select('id')
    .eq('billzo_message_id', msgId)
    .limit(1)
    .maybeSingle()
  if (byBillzoId?.id) return byBillzoId.id

  const { data: byProviderReceipt } = await supabaseAdmin
    .from('collection_actions')
    .select('id')
    .filter('metadata->>provider_message_id', 'eq', msgId)
    .limit(1)
    .maybeSingle()

  return byProviderReceipt?.id ?? null
}

export async function updateDeliveryStatus(tenantId: string, st: NormalizedStatus) {
  if (!st.id) return
  const patch: Record<string, unknown> = {}
  if (st.status === 'delivered') patch.delivered_at = tsToIso(st.timestamp) ?? new Date().toISOString()
  if (st.status === 'read') patch.read_at = tsToIso(st.timestamp) ?? new Date().toISOString()
  if (st.status) patch.status = st.status
  if (Object.keys(patch).length === 0) return

  // Provider identity, not temporal proximity, resolves the attempt.
  // Prefer a row carrying the attempt id; fall back to any row so status
  // patches never depend on a specific event row.
  const { data: withAttempt } = await supabaseAdmin
    .from('whatsapp_events')
    .select('recovery_attempt_id, invoice_id, customer_id')
    .eq('tenant_id', tenantId)
    .eq('provider_message_id', st.id)
    .not('recovery_attempt_id', 'is', null)
    .limit(1)
    .maybeSingle()

  let message: { recovery_attempt_id: string | null; invoice_id: string | null; customer_id: string | null } | null =
    withAttempt ?? null
  if (!message) {
    const { data: anyRow } = await supabaseAdmin
      .from('whatsapp_events')
      .select('recovery_attempt_id, invoice_id, customer_id')
      .eq('tenant_id', tenantId)
      .eq('provider_message_id', st.id)
      .limit(1)
      .maybeSingle()
    message = anyRow ?? null
  }

  await supabaseAdmin
    .from('whatsapp_events')
    .update(patch)
    .eq('tenant_id', tenantId)
    .eq('provider_message_id', st.id)

  const outcomeType = st.status === 'delivered'
    ? 'delivered'
    : st.status === 'read'
      ? 'customer_read'
      : null
  if (!outcomeType || !message?.recovery_attempt_id) return

  const outcomeAt = tsToIso(st.timestamp) ?? new Date().toISOString()
  await supabaseAdmin
    .from('recovery_outcomes')
    .upsert({
      tenant_id: tenantId,
      recovery_attempt_id: message.recovery_attempt_id,
      outcome_type: outcomeType,
      outcome_at: outcomeAt,
      invoice_id: message.invoice_id,
      customer_id: message.customer_id,
      attribution_method: 'explicit',
      attribution_status: 'verified',
      confidence_score: 1,
      provider_message_id: st.id,
      metadata: { provider_status: st.status },
    }, { onConflict: 'recovery_attempt_id,outcome_type,provider_message_id' })
}
