"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.textBody = textBody;
exports.normalizePayload = normalizePayload;
exports.tsToIso = tsToIso;
/** Meta sends text as { body: "..." }, Gupshup sends it as a plain string. */
function textBody(text) {
    if (!text)
        return null;
    if (typeof text === 'string')
        return text;
    if (typeof text === 'object' && typeof text.body === 'string')
        return text.body;
    return null;
}
/**
 * Normalize Meta passthrough + flat Gupshup shapes into one internal form.
 * Pure — no client, no side effects.
 */
function normalizePayload(payload) {
    const events = [];
    // Meta passthrough: entry[].changes[].value
    for (const entry of Array.isArray(payload?.entry) ? payload.entry : []) {
        for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
            const value = change?.value;
            const phoneNumberId = value?.metadata?.phone_number_id;
            if (!phoneNumberId)
                continue;
            if (Array.isArray(value?.messages)) {
                events.push({ eventType: 'customer_message', phoneNumberId, wabaId: entry.id, messages: value.messages });
            }
            if (Array.isArray(value?.statuses)) {
                events.push({ eventType: 'status', phoneNumberId, wabaId: entry.id, statuses: value.statuses });
            }
        }
    }
    // Flat Gupshup callback: { event, data: { phone_number_id, messages|statuses } }
    if (payload?.event && payload?.data?.phone_number_id) {
        const phoneNumberId = payload.data.phone_number_id;
        const messages = Array.isArray(payload.data.messages) ? payload.data.messages : payload.data.messages ? [payload.data.messages] : [];
        const statuses = Array.isArray(payload.data.statuses) ? payload.data.statuses : [];
        if (payload.event === 'smb_message_echoes') {
            events.push({ eventType: 'merchant_echo', phoneNumberId, messages });
        }
        else if (payload.event === 'message' || payload.event === 'messages') {
            events.push({ eventType: 'customer_message', phoneNumberId, messages });
        }
        else if (payload.event === 'message_status' || payload.event === 'statuses') {
            events.push({ eventType: 'status', phoneNumberId, statuses });
        }
    }
    return events;
}
function tsToIso(ts) {
    const n = ts ? parseInt(ts) : NaN;
    return Number.isFinite(n) ? new Date(n * 1000).toISOString() : undefined;
}
//# sourceMappingURL=normalize.js.map