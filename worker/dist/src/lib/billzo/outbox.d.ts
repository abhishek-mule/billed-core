export type OutboxStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'dead_letter';
export interface OutboxEvent {
    id: string;
    causationId: string | null;
    correlationId: string;
    type: string;
    version: number;
    tenantId: string;
    entityId: string | null;
    payload: Record<string, unknown> | null;
    idempotencyKey: string | null;
    status: OutboxStatus;
    createdAt: string;
    nextAttemptAt: string;
    attempts: number;
}
export interface OutboxWriteOptions {
    type: string;
    tenantId: string;
    entityId?: string | null;
    payload?: Record<string, unknown> | null;
    causationId?: string | null;
    correlationId?: string;
    idempotencyKey?: string | null;
    version?: number;
}
/**
 * Write an event to the outbox table.
 * Should be called within the same transaction as the business state write.
 * Returns the outbox event ID.
 */
export declare function writeOutboxEvent(options: OutboxWriteOptions): Promise<string>;
/**
 * Poll pending outbox events for processing.
 * Returns events that are ready for processing (status = 'pending' AND next_attempt_at <= now).
 */
export declare function pollOutboxEvents(limit?: number): Promise<OutboxEvent[]>;
/**
 * Mark an outbox event as processing.
 */
export declare function markEventProcessing(eventId: string): Promise<boolean>;
/**
 * Mark an outbox event as completed.
 */
export declare function markEventCompleted(eventId: string): Promise<boolean>;
/**
 * Mark an outbox event as failed with retry scheduling.
 */
export declare function markEventFailed(eventId: string, attempt: number, maxAttempts?: number): Promise<{
    status: 'retry' | 'dead_letter';
    nextAttemptAt: string;
}>;
/**
 * Get outbox event by ID.
 */
export declare function getOutboxEvent(eventId: string): Promise<OutboxEvent | null>;
/**
 * Get outbox events by correlation ID (for tracing a recovery lifecycle).
 */
export declare function getOutboxEventsByCorrelation(correlationId: string): Promise<OutboxEvent[]>;
/**
 * Clean up completed events older than specified hours.
 */
export declare function cleanupCompletedEvents(olderThanHours?: number): Promise<number>;
//# sourceMappingURL=outbox.d.ts.map