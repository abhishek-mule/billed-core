import type { NormalizedEvent, WebhookInboxRow } from './types';
/**
 * Durable inbox ingestion helpers (G1).
 *
 * The webhook route is deliberately thin:
 *   authenticate -> parse -> normalizePayload -> sanitize -> Postgres upsert -> 200
 * This module builds the `webhook_inbox` rows and owns `sanitizeRaw`, the
 * boundary that keeps persisted payloads free of credential-shaped material
 * and bounded in size (500-char strings, 20-item arrays, 16,000-byte cap).
 *
 * provider_event_id (the idempotency key, UNIQUE(provider, provider_event_id)):
 *   - customer_message / merchant_echo -> provider message id
 *   - status                           -> `messageId:status` (locked rule: the
 *     provider supplies no unique status-event id, so a delivered/read pair on
 *     the same message yields distinct keys)
 * Fallbacks keep the key non-NULL (the column is NOT NULL).
 */
/** Strip anything credential-shaped and bound the payload size. */
export declare function sanitizeRaw(value: unknown): Record<string, unknown> | null;
/**
 * Flatten normalized events into one row per provider message/status.
 * Each row's `payload` is the sanitized normalized event scoped to that single
 * message/status — the exact reproduction source the consumer reprocesses.
 * `payload_raw` (nullable) carries the sanitized raw provider envelope for
 * forensic context. Neither ever contains the webhook secret or credentials.
 */
export declare function buildInboxRows(events: NormalizedEvent[], provider: 'gupshup' | 'meta', rawEnvelope?: unknown): WebhookInboxRow[];
//# sourceMappingURL=inbox.d.ts.map