export declare function uuidv7(): string;
export declare function uuidv7Timestamp(uuid: string): number;
export interface ExternalRefs {
    whatsapp_message_id?: string | null;
    razorpay_payment_id?: string | null;
    upi_ref?: string | null;
    provider_message_id?: string | null;
}
export type SpineSourceSystem = 'worker' | 'api' | 'webhook' | 'cron' | 'client' | 'system';
export type SpineEntityType = 'invoice' | 'customer' | 'payment' | 'recovery_case' | 'tenant' | 'product' | 'whatsapp_message' | 'unknown';
export interface SpineEvent {
    readonly event_id: string;
    readonly entity_type: SpineEntityType;
    readonly entity_id: string;
    readonly causal_id: string | null;
    readonly correlation_id: string;
    readonly sequence_no: number;
    readonly occurred_at: string;
    readonly ingested_at: string;
    readonly source_system: SpineSourceSystem;
    readonly idempotency_key: string;
    readonly tenant_id?: string;
    readonly payload: Record<string, unknown>;
    readonly external_refs?: ExternalRefs;
}
export interface SpineEventInput {
    entity_type: SpineEntityType;
    entity_id: string;
    causal_id?: string | null;
    correlation_id?: string;
    occurred_at?: string;
    source_system: SpineSourceSystem;
    idempotency_key: string;
    tenant_id?: string;
    payload?: Record<string, unknown>;
    external_refs?: ExternalRefs;
}
export interface SpineWriteResult {
    accepted: boolean;
    event_id?: string;
    sequence_no?: number;
    error?: string;
}
export declare const VALID_ENTITY_TYPES: SpineEntityType[];
export declare const VALID_SOURCE_SYSTEMS: SpineSourceSystem[];
export interface SpineValidationError {
    field: string;
    message: string;
}
export declare function validateSpineEventInput(input: unknown): SpineValidationError[];
export declare function inferEntityType(eventType: string): SpineEntityType;
//# sourceMappingURL=spine.d.ts.map