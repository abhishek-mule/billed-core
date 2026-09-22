/**
 * Shared WhatsApp webhook domain types (Step 3 extraction).
 *
 * These are the frozen contracts pinned by the domain suites
 * (shared src/whatsapp/__tests__ and the frontend attribution chain test).
 * The webhook route, the inbox consumer (worker), and the domain layer all
 * speak these shapes.
 */

/** A single normalized provider message (Meta + Gupshup unified). */
export interface NormalizedMessage {
  id?: string
  from?: string
  to?: string
  timestamp?: string
  type?: string
  text?: string | { body?: string }
  /** Provider-parent identity: the message this reply references (Meta:
   *  context.id; Gupshup: contextId). Resolves the recovery attempt this
   *  reply belongs to — never by timestamp proximity. */
  contextId?: string
}

export interface NormalizedStatus {
  id?: string
  status?: string
  timestamp?: string
  recipient_id?: string
}

export interface NormalizedEvent {
  eventType: 'customer_message' | 'merchant_echo' | 'status'
  phoneNumberId: string
  wabaId?: string
  messages?: NormalizedMessage[]
  statuses?: NormalizedStatus[]
}

/** Server-authoritative WhatsApp connection state (migration 090). */
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

/** Ingest shape produced by buildInboxRows (status is always 'queued'). */
export interface WebhookInboxRow {
  provider: 'gupshup' | 'meta'
  provider_event_id: string
  provider_event_type: 'customer_message' | 'merchant_echo' | 'status'
  phone_number_id: string
  status: 'queued'
  payload: Record<string, unknown>
  payload_raw: Record<string, unknown> | null
}

export type WebhookInboxStatus = 'queued' | 'processing' | 'done' | 'failed' | 'dead'

/** A claimed row as returned by claim_next_webhook_events. */
export interface ClaimedWebhookInboxRow {
  id: string
  provider: 'gupshup' | 'meta'
  provider_event_id: string
  provider_event_type: 'customer_message' | 'merchant_echo' | 'status'
  phone_number_id: string | null
  status: WebhookInboxStatus
  attempts: number
  available_at: string
  last_error: string | null
  payload: Record<string, unknown>
  payload_raw: Record<string, unknown> | null
  created_at: string
  updated_at: string
}