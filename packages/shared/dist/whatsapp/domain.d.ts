import type { SupabaseClient } from '@supabase/supabase-js';
import type { NormalizedMessage, NormalizedStatus } from './types';
/**
 * Webhook domain persistence — shared by the Next.js route-era consumers and
 * the worker's inbox drain. Client-injected so this module stays
 * runtime-dependency-free (both runtimes build an identical supabaseAdmin).
 *
 * The functions are frozen by the shared domain suite and the frontend
 * attribution chain test. Provider identity — never temporal proximity —
 * resolves recovery attempts.
 */
export interface ReplyContext {
    recovery_attempt_id: string | null;
    invoice_id: string | null;
    customer_id: string | null;
}
export interface WhatsAppDomain {
    persistInboundWhatsAppEvent(tenantId: string, connection: {
        phone_number_id: string;
    }, msg: NormalizedMessage, customerId: string | null): Promise<void>;
    persistEchoWhatsAppEvent(tenantId: string, connection: {
        phone_number_id: string;
    }, msg: NormalizedMessage, customerId: string | null): Promise<void>;
    updateDeliveryStatus(tenantId: string, st: NormalizedStatus): Promise<void>;
    /**
     * Resolve the recovery attempt + invoice context from a provider parent id.
     * Returns null when no attempt is provable — the caller records UNKNOWN
     * causality.
     */
    resolveReplyContext(contextId: string): Promise<ReplyContext | null>;
    /**
     * Resolve the recovery attempt (collection_actions.id) that produced a
     * provided message. Tries the billzo id first, then the raw provider receipt
     * stored on the attempt. Returns null when no attempt matches.
     */
    resolveAttemptForMessageId(msgId: string): Promise<string | null>;
    /** Tenant-scoped customer match by phone. Never used to infer tenant. */
    matchCustomer(tenantId: string, phone?: string): Promise<string | null>;
}
export declare function createWhatsAppDomain(client: SupabaseClient): WhatsAppDomain;
//# sourceMappingURL=domain.d.ts.map