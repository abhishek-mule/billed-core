import { supabaseAdmin } from './supabase-admin'

/**
 * Server-authoritative WhatsApp connection state + pilot forensic trace.
 *
 * SECURITY INVARIANT (migration 090):
 *   Every inbound WhatsApp event resolves tenant ONLY via
 *   phone_number_id -> whatsapp_connections -> tenant_id.
 *   If resolution fails: record an unattributed pilot_event and stop.
 *   Never guess the tenant from customer phone, session, or request body.
 *
 * Dexie (whatsapp-connection.ts) is UI cache only — never used by API routes.
 */

export interface WhatsAppConnectionRow {
  id: string
  tenant_id: string
  waba_id: string
  phone_number_id: string
  display_name: string | null
  provider: string
  status: 'connecting' | 'connected' | 'disconnected' | 'error'
  last_error: string | null
}

export type PilotEventKind =
  | 'connect'
  | 'reminder_sent'
  | 'customer_replied'
  | 'merchant_app_reply'
  | 'message_status'
  | 'payment_created'
  | 'payment_received'
  | 'automation_stopped'
  | 'unattributed_webhook'
  | 'webhook_error'

export interface PilotEventInput {
  /** Omit when unresolved — the row records the failure instead of guessing. */
  tenantId?: string | null
  customerId?: string | null
  phoneNumberId?: string | null
  eventKind: PilotEventKind
  direction?: 'inbound' | 'outbound' | 'internal'
  provider?: string | null
  providerEventId?: string | null
  providerMessageId?: string | null
  providerEventType?: string | null
  providerStatus?: string | null
  providerErrorCode?: string | null
  providerErrorMessage?: string | null
  attributionResult?: 'resolved' | 'unattributed' | 'customer_unmatched' | null
  stateBefore?: Record<string, unknown> | null
  stateAfter?: Record<string, unknown> | null
  /** Bounded, sanitized provider payload. Never contains credentials. */
  rawPayload?: Record<string, unknown> | null
  occurredAt?: string | null
}

/** Resolve tenant strictly by phone_number_id. Returns null when unknown. */
export async function resolveTenantByPhoneNumberId(
  phoneNumberId: string
): Promise<WhatsAppConnectionRow | null> {
  const { data, error } = await supabaseAdmin
    .from('whatsapp_connections')
    .select('id, tenant_id, waba_id, phone_number_id, display_name, provider, status, last_error')
    .eq('phone_number_id', phoneNumberId)
    .maybeSingle()

  if (error) {
    console.error('[WhatsAppServer] connection lookup failed:', error.message)
    return null
  }
  return (data as WhatsAppConnectionRow) ?? null
}

/** Insert or refresh the server-side connection row after onboarding. */
export async function upsertWhatsAppConnection(input: {
  tenantId: string
  wabaId: string
  phoneNumberId: string
  displayName?: string | null
  provider?: string
  status?: WhatsAppConnectionRow['status']
}): Promise<WhatsAppConnectionRow | null> {
  const now = new Date().toISOString()
  const { data, error } = await supabaseAdmin
    .from('whatsapp_connections')
    .upsert(
      {
        tenant_id: input.tenantId,
        waba_id: input.wabaId,
        phone_number_id: input.phoneNumberId,
        display_name: input.displayName ?? null,
        provider: input.provider ?? 'gupshup',
        status: input.status ?? 'connected',
        updated_at: now,
      },
      { onConflict: 'phone_number_id' },
    )
    .select('id, tenant_id, waba_id, phone_number_id, display_name, provider, status, last_error')
    .maybeSingle()

  if (error) {
    console.error('[WhatsAppServer] connection upsert failed:', error.message)
    return null
  }
  return (data as WhatsAppConnectionRow) ?? null
}

/**
 * Append one forensic trace row.
 *
 * Dedup: a unique partial index on (provider_event_type, provider_message_id,
 * provider_status) rejects provider retries — duplicate inserts are silently
 * ignored and reported as duplicate: true.
 */
export async function recordPilotEvent(
  input: PilotEventInput
): Promise<{ recorded: boolean; duplicate: boolean }> {
  const row = {
    tenant_id: input.tenantId ?? null,
    customer_id: input.customerId ?? null,
    phone_number_id: input.phoneNumberId ?? null,
    event_kind: input.eventKind,
    direction: input.direction ?? null,
    provider: input.provider ?? 'gupshup',
    provider_event_id: input.providerEventId ?? null,
    provider_message_id: input.providerMessageId ?? null,
    provider_event_type: input.providerEventType ?? null,
    provider_status: input.providerStatus ?? null,
    provider_error_code: input.providerErrorCode ?? null,
    provider_error_message: input.providerErrorMessage ?? null,
    attribution_result:
      input.attributionResult ?? (input.tenantId ? 'resolved' : 'unattributed'),
    state_before: input.stateBefore ?? null,
    state_after: input.stateAfter ?? null,
    raw_payload: input.rawPayload ?? null,
    occurred_at: input.occurredAt ?? new Date().toISOString(),
  }

  const { data, error } = await supabaseAdmin
    .from('pilot_events')
    .insert(row)
    .select('id')
    .maybeSingle()

  if (error) {
    // Unique-violation from the dedup index => provider retry, not a failure.
    if (error.code === '23505') return { recorded: false, duplicate: true }
    console.error('[WhatsAppServer] pilot_event insert failed:', error.message)
    return { recorded: false, duplicate: false }
  }
  return { recorded: !!data, duplicate: false }
}
