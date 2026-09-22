import type { SupabaseClient } from '@supabase/supabase-js';
import type { PilotEventInput, WhatsAppConnectionRow } from './types';
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
    resolveTenantByPhoneNumberId(phoneNumberId: string): Promise<WhatsAppConnectionRow | null>;
    /** Insert or refresh the server-side connection row after onboarding. */
    upsertWhatsAppConnection(input: {
        tenantId: string;
        wabaId: string;
        phoneNumberId: string;
        displayName?: string | null;
        provider?: string;
        status?: WhatsAppConnectionRow['status'];
    }): Promise<WhatsAppConnectionRow | null>;
    /**
     * Append one forensic trace row.
     *
     * Dedup: a unique partial index on (provider_event_type, provider_message_id,
     * provider_status) rejects provider retries — duplicate inserts are silently
     * ignored and reported as duplicate: true.
     */
    recordPilotEvent(input: PilotEventInput): Promise<{
        recorded: boolean;
        duplicate: boolean;
    }>;
}
export declare function createWhatsAppServer(client: SupabaseClient): WhatsAppServer;
//# sourceMappingURL=server.d.ts.map