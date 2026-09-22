import type { SupabaseClient } from '@supabase/supabase-js'
import type { PilotEventInput, WhatsAppConnectionRow } from './types'

/**
 * Server-authoritative WhatsApp connection state + pilot forensic trace.
 *
 * SECURITY INVARIANT (migration 090):
 *   Every inbound WhatsApp event resolves tenant ONLY via
 *   phone_number_id -> whatsapp_connections -> tenant_id.
 *   If resolution fails: record an unattributed pilot_event and stop.
 *   Never guess the tenant from customer phone, session, or request body.
 *
 * The client is injected so this module stays runtime-dependency-free; the
 * Next.js route and the worker each bind their own service-role client
 * (both runtimes build an identical supabaseAdmin lazy proxy).
 */

export interface WhatsAppServer {
  /** Resolve tenant strictly by phone_number_id. Returns null when unknown. */
  resolveTenantByPhoneNumberId(phoneNumberId: string): Promise<WhatsAppConnectionRow | null>
  /** Insert or refresh the server-side connection row after onboarding. */
  upsertWhatsAppConnection(input: {
    tenantId: string
    wabaId: string
    phoneNumberId: string
    displayName?: string | null
    provider?: string
    status?: WhatsAppConnectionRow['status']
  }): Promise<WhatsAppConnectionRow | null>
  /**
   * Append one forensic trace row.
   *
   * Dedup: a unique partial index on (provider_event_type, provider_message_id,
   * provider_status) rejects provider retries — duplicate inserts are silently
   * ignored and reported as duplicate: true.
   */
  recordPilotEvent(input: PilotEventInput): Promise<{ recorded: boolean; duplicate: boolean }>
}

export function createWhatsAppServer(client: SupabaseClient): WhatsAppServer {
  async function resolveTenantByPhoneNumberId(
    phoneNumberId: string,
  ): Promise<WhatsAppConnectionRow | null> {
    const { data, error } = await client
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

  async function upsertWhatsAppConnection(input: {
    tenantId: string
    wabaId: string
    phoneNumberId: string
    displayName?: string | null
    provider?: string
    status?: WhatsAppConnectionRow['status']
  }): Promise<WhatsAppConnectionRow | null> {
    const now = new Date().toISOString()
    const { data, error } = await client
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

  async function recordPilotEvent(
    input: PilotEventInput,
  ): Promise<{ recorded: boolean; duplicate: boolean }> {
    const row: Record<string, unknown> = {
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

    const { data, error } = await client
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

  return { resolveTenantByPhoneNumberId, upsertWhatsAppConnection, recordPilotEvent }
}