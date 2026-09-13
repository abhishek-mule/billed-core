// ============================================================
// NOTIFICATION CONTRACT — dedupe keys (spec §12)
// ============================================================
// Exactly-once is enforced at the DB via UNIQUE(tenant_id, dedupe_key)
// (migration 095). These builders produce the deterministic, stable keys
// that guarantees:
//
//   * entity alerts     → `<type>:<entityId>`
//   * state transitions → `<type>:<entityId>:<state>` (inventory re-alert
//     after returning to NORMAL; caller appends the product_alert_cycle
//     so it is unique per cycle visit)
//   * event alerts      → `<type>:evt:<sourceEventId>` (recovery
//     transition / payment, attributed 1:1 to the authoritative event)
//
// A retried worker/handler (at-least-once outbox semantics) hits the unique
// constraint and the duplicate insert is a no-op.

import type { NotificationType } from './types'

export function dedupeKeyFor(type: NotificationType, entityId: string, state?: string): string {
  return state ? `${type}:${entityId}:${state}` : `${type}:${entityId}`
}

export function dedupeKeyForEvent(type: NotificationType, sourceEventId: string): string {
  return `${type}:evt:${sourceEventId}`
}