"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createWhatsAppDomain = createWhatsAppDomain;
const crypto_1 = __importDefault(require("crypto"));
const normalize_1 = require("./normalize");
function createWhatsAppDomain(client) {
    /**
     * Resolve the recovery attempt (collection_actions.id) that produced a
     * provided message. Tries the billzo id first, then the raw provider receipt
     * stored on the attempt. Returns null when no attempt matches — the caller
     * records an unlinked (unknown) event rather than guessing causality.
     */
    async function resolveAttemptForMessageId(msgId) {
        const { data: byBillzoId } = await client
            .from('collection_actions')
            .select('id')
            .eq('billzo_message_id', msgId)
            .limit(1)
            .maybeSingle();
        if (byBillzoId?.id)
            return byBillzoId.id;
        const { data: byProviderReceipt } = await client
            .from('collection_actions')
            .select('id')
            .filter('metadata->>provider_message_id', 'eq', msgId)
            .limit(1)
            .maybeSingle();
        return byProviderReceipt?.id ?? null;
    }
    /**
     * Resolve the recovery attempt + invoice context from a provider parent id
     * (the outbound message this reply references). Identity only:
     * whatsapp_events.provider_message_id, preferring rows that already carry the
     * attempt id, falling back to collection_actions linkage. Returns null when
     * no attempt is provable — the caller records UNKNOWN causality.
     */
    async function resolveReplyContext(contextId) {
        const { data: withAttempt } = await client
            .from('whatsapp_events')
            .select('recovery_attempt_id, invoice_id, customer_id')
            .eq('provider_message_id', contextId)
            .not('recovery_attempt_id', 'is', null)
            .limit(1)
            .maybeSingle();
        if (withAttempt?.recovery_attempt_id) {
            return {
                recovery_attempt_id: withAttempt.recovery_attempt_id,
                invoice_id: withAttempt.invoice_id ?? null,
                customer_id: withAttempt.customer_id ?? null,
            };
        }
        const { data: anyRow } = await client
            .from('whatsapp_events')
            .select('recovery_attempt_id, invoice_id, customer_id')
            .eq('provider_message_id', contextId)
            .limit(1)
            .maybeSingle();
        const attemptId = anyRow?.recovery_attempt_id ?? (await resolveAttemptForMessageId(contextId));
        return attemptId
            ? {
                recovery_attempt_id: attemptId,
                invoice_id: anyRow?.invoice_id ?? null,
                customer_id: anyRow?.customer_id ?? null,
            }
            : null;
    }
    /** Tenant-scoped customer match by phone. Never used to infer tenant. */
    async function matchCustomer(tenantId, phone) {
        if (!phone)
            return null;
        const digits = phone.replace(/\D/g, '');
        const { data } = await client
            .from('customers')
            .select('id')
            .eq('tenant_id', tenantId)
            .or(`phone.eq.${phone},phone.eq.${digits},phone.eq.+${digits}`)
            .limit(1)
            .maybeSingle();
        return data?.id ?? null;
    }
    async function persistInboundWhatsAppEvent(tenantId, connection, msg, customerId) {
        // Domain-side dedup: pilot_events dedups the trace; this keeps whatsapp_events clean too.
        if (msg.id) {
            const { data: existing } = await client
                .from('whatsapp_events')
                .select('id')
                .eq('tenant_id', tenantId)
                .eq('provider_message_id', msg.id)
                .limit(1)
                .maybeSingle();
            if (existing)
                return;
        }
        // A reply is attributed to an attempt ONLY through provider parent identity.
        // No parent / unresolvable parent ⇒ unknown causality, never a timestamp guess.
        const contextId = msg.contextId || null;
        const resolved = contextId ? await resolveReplyContext(contextId) : null;
        const recoveryAttemptId = resolved?.recovery_attempt_id ?? null;
        const occurredAt = (0, normalize_1.tsToIso)(msg.timestamp) ?? new Date().toISOString();
        await client.from('whatsapp_events').insert({
            id: crypto_1.default.randomUUID(),
            billzo_message_id: msg.id ?? crypto_1.default.randomUUID(),
            tenant_id: tenantId,
            customer_id: customerId,
            phone: msg.from ?? null,
            phone_number_id: connection.phone_number_id,
            conversation_id: `conv_${msg.from ?? 'unknown'}`,
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
                text: (0, normalize_1.textBody)(msg.text)?.slice(0, 500),
                context_id: contextId,
                replied_to_attempt: recoveryAttemptId ?? null,
            },
        });
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
        };
        if (recoveryAttemptId) {
            await client.from('recovery_outcomes').upsert(outcome, {
                onConflict: 'recovery_attempt_id,outcome_type,provider_message_id',
            });
        }
        else {
            await client.from('recovery_outcomes').insert(outcome);
        }
    }
    async function persistEchoWhatsAppEvent(tenantId, connection, msg, customerId) {
        if (msg.id) {
            const { data: existing } = await client
                .from('whatsapp_events')
                .select('id')
                .eq('tenant_id', tenantId)
                .eq('provider_message_id', msg.id)
                .limit(1)
                .maybeSingle();
            if (existing)
                return;
        }
        // The provider echo reflects an outbound message we sent. Resolve the
        // attempt from provider identity (billzo_message_id or the provider receipt
        // stored in action metadata) so the append-only outbound row carries the
        // causal spine. No match => unknown, not guessed.
        const recoveryAttemptId = msg.id ? await resolveAttemptForMessageId(msg.id) : null;
        await client.from('whatsapp_events').insert({
            id: crypto_1.default.randomUUID(),
            billzo_message_id: msg.id ?? crypto_1.default.randomUUID(),
            tenant_id: tenantId,
            customer_id: customerId,
            phone: msg.to ?? null,
            phone_number_id: connection.phone_number_id,
            conversation_id: `conv_${msg.to ?? 'unknown'}`,
            direction: 'outbound',
            message_type: 'merchant_app_reply',
            event_layer: 'transport',
            message_origin: 'merchant_app',
            provider_message_id: msg.id ?? null,
            recovery_attempt_id: recoveryAttemptId,
            status: 'sent',
            occurred_at: (0, normalize_1.tsToIso)(msg.timestamp) ?? new Date().toISOString(),
            metadata: { type: msg.type, text: (0, normalize_1.textBody)(msg.text)?.slice(0, 500) },
        });
    }
    async function updateDeliveryStatus(tenantId, st) {
        if (!st.id)
            return;
        const patch = {};
        if (st.status === 'delivered')
            patch.delivered_at = (0, normalize_1.tsToIso)(st.timestamp) ?? new Date().toISOString();
        if (st.status === 'read')
            patch.read_at = (0, normalize_1.tsToIso)(st.timestamp) ?? new Date().toISOString();
        if (st.status)
            patch.status = st.status;
        if (Object.keys(patch).length === 0)
            return;
        // Provider identity, not temporal proximity, resolves the attempt.
        // Prefer a row carrying the attempt id; fall back to any row so status
        // patches never depend on a specific event row.
        const { data: withAttempt } = await client
            .from('whatsapp_events')
            .select('recovery_attempt_id, invoice_id, customer_id')
            .eq('tenant_id', tenantId)
            .eq('provider_message_id', st.id)
            .not('recovery_attempt_id', 'is', null)
            .limit(1)
            .maybeSingle();
        let message = withAttempt ?? null;
        if (!message) {
            const { data: anyRow } = await client
                .from('whatsapp_events')
                .select('recovery_attempt_id, invoice_id, customer_id')
                .eq('tenant_id', tenantId)
                .eq('provider_message_id', st.id)
                .limit(1)
                .maybeSingle();
            message = anyRow ?? null;
        }
        await client
            .from('whatsapp_events')
            .update(patch)
            .eq('tenant_id', tenantId)
            .eq('provider_message_id', st.id);
        const outcomeType = st.status === 'delivered'
            ? 'delivered'
            : st.status === 'read'
                ? 'customer_read'
                : null;
        if (!outcomeType || !message?.recovery_attempt_id)
            return;
        const outcomeAt = (0, normalize_1.tsToIso)(st.timestamp) ?? new Date().toISOString();
        await client.from('recovery_outcomes').upsert({
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
        }, { onConflict: 'recovery_attempt_id,outcome_type,provider_message_id' });
    }
    return {
        persistInboundWhatsAppEvent,
        persistEchoWhatsAppEvent,
        updateDeliveryStatus,
        resolveReplyContext,
        resolveAttemptForMessageId,
        matchCustomer,
    };
}
//# sourceMappingURL=domain.js.map