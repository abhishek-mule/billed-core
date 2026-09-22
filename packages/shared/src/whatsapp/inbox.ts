import type { NormalizedEvent, WebhookInboxRow } from './types'

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
export function sanitizeRaw(value: unknown): Record<string, unknown> | null {
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

function providerEventIdForMessage(msg: { id?: string }): string {
  return msg.id ?? 'no-id'
}

function providerEventIdForStatus(st: { id?: string; status?: string }): string {
  return `${st.id ?? 'no-id'}:${st.status ?? 'unknown'}`
}

/**
 * Flatten normalized events into one row per provider message/status.
 * Each row's `payload` is the sanitized normalized event scoped to that single
 * message/status — the exact reproduction source the consumer reprocesses.
 * `payload_raw` (nullable) carries the sanitized raw provider envelope for
 * forensic context. Neither ever contains the webhook secret or credentials.
 */
export function buildInboxRows(
  events: NormalizedEvent[],
  provider: 'gupshup' | 'meta',
  rawEnvelope?: unknown,
): WebhookInboxRow[] {
  const rows: WebhookInboxRow[] = []
  const rawPayload = sanitizeRaw(rawEnvelope ?? null)

  for (const ev of events) {
    if (ev.eventType === 'status') {
      for (const st of ev.statuses ?? []) {
        rows.push({
          provider,
          provider_event_id: providerEventIdForStatus(st),
          provider_event_type: 'status',
          phone_number_id: ev.phoneNumberId,
          status: 'queued',
          payload: sanitizeRaw({ ...ev, statuses: [st] }) as Record<string, unknown>,
          payload_raw: rawPayload,
        })
      }
      continue
    }

    for (const msg of ev.messages ?? []) {
      rows.push({
        provider,
        provider_event_id: providerEventIdForMessage(msg),
        provider_event_type: ev.eventType,
        phone_number_id: ev.phoneNumberId,
        status: 'queued',
        payload: sanitizeRaw({ ...ev, messages: [msg] }) as Record<string, unknown>,
        payload_raw: rawPayload,
      })
    }
  }

  return rows
}