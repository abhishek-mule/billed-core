export interface IdempotencyResult {
    isDuplicate: boolean;
    previousResult?: Record<string, unknown> | null;
}
/**
 * Idempotency key patterns per domain.
 * Format: {domain}:{entityId}:{context}
 */
export declare const IdempotencyPatterns: {
    readonly paymentReconcile: (invoiceId: string, provider: string, providerPaymentId: string) => string;
    readonly reminderSent: (invoiceId: string, stage: string, dayBucket: string) => string;
    readonly whatsappSent: (invoiceId: string, template: string, phone: string) => string;
    readonly invoiceCreated: (tenantId: string, customerId: string, timestamp: string) => string;
    readonly paymentLinkGenerated: (invoiceId: string) => string;
    readonly recoveryAttribution: (invoiceId: string, paymentId: string) => string;
    readonly experimentAssigned: (invoiceId: string, experimentType: string) => string;
};
/**
 * Check if a job has already been processed (idempotency check).
 * Returns { isDuplicate: true, previousResult } if already processed.
 */
export declare function checkIdempotency(idempotencyKey: string): Promise<IdempotencyResult>;
/**
 * Record a job as processed.
 * Should be called AFTER successful job execution.
 */
export declare function recordProcessedJob(idempotencyKey: string, jobType: string, tenantId: string, status: string, result?: Record<string, unknown> | null): Promise<boolean>;
/**
 * Execute a job with idempotency guard.
 * If the job was already processed, returns the previous result.
 * Otherwise, executes the job and records the result.
 */
export declare function executeIdempotent<T>(idempotencyKey: string, jobType: string, tenantId: string, executor: () => Promise<T>): Promise<T>;
/**
 * Generate a correlation ID for a recovery lifecycle.
 * All events in the same recovery journey share this ID.
 */
export declare function generateCorrelationId(invoiceId: string): string;
/**
 * Generate a correlation ID for a sync operation.
 */
export declare function generateSyncCorrelationId(tenantId: string, entityType: string, entityId: string): string;
//# sourceMappingURL=idempotency.d.ts.map