"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.dedupeKeyFor = dedupeKeyFor;
exports.dedupeKeyForEvent = dedupeKeyForEvent;
function dedupeKeyFor(type, entityId, state) {
    return state ? `${type}:${entityId}:${state}` : `${type}:${entityId}`;
}
function dedupeKeyForEvent(type, sourceEventId) {
    return `${type}:evt:${sourceEventId}`;
}
//# sourceMappingURL=keys.js.map