"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createWhatsAppServer = createWhatsAppServer;
function createWhatsAppServer(client) {
    async function resolveTenantByPhoneNumberId(phoneNumberId) {
        const { data, error } = await client
            .from('whatsapp_connections')
            .select('id, tenant_id, waba_id, phone_number_id, display_name, provider, status, last_error')
            .eq('phone_number_id', phoneNumberId)
            .maybeSingle();
        if (error) {
            console.error('[WhatsAppServer] connection lookup failed:', error.message);
            return null;
        }
        return data ?? null;
    }
    async function upsertWhatsAppConnection(input) {
        const now = new Date().toISOString();
        const { data, error } = await client
            .from('whatsapp_connections')
            .upsert({
            tenant_id: input.tenantId,
            waba_id: input.wabaId,
            phone_number_id: input.phoneNumberId,
            display_name: input.displayName ?? null,
            provider: input.provider ?? 'gupshup',
            status: input.status ?? 'connected',
            updated_at: now,
        }, { onConflict: 'phone_number_id' })
            .select('id, tenant_id, waba_id, phone_number_id, display_name, provider, status, last_error')
            .maybeSingle();
        if (error) {
            console.error('[WhatsAppServer] connection upsert failed:', error.message);
            return null;
        }
        return data ?? null;
    }
    async function recordPilotEvent(input) {
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
            attribution_result: input.attributionResult ?? (input.tenantId ? 'resolved' : 'unattributed'),
            state_before: input.stateBefore ?? null,
            state_after: input.stateAfter ?? null,
            raw_payload: input.rawPayload ?? null,
            occurred_at: input.occurredAt ?? new Date().toISOString(),
        };
        const { data, error } = await client
            .from('pilot_events')
            .insert(row)
            .select('id')
            .maybeSingle();
        if (error) {
            // Unique-violation from the dedup index => provider retry, not a failure.
            if (error.code === '23505')
                return { recorded: false, duplicate: true };
            console.error('[WhatsAppServer] pilot_event insert failed:', error.message);
            return { recorded: false, duplicate: false };
        }
        return { recorded: !!data, duplicate: false };
    }
    return { resolveTenantByPhoneNumberId, upsertWhatsAppConnection, recordPilotEvent };
}
//# sourceMappingURL=server.js.map