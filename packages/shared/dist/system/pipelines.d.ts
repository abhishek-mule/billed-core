export interface PipelineContract<TPayload = unknown> {
    id: string;
    producer: string;
    consumers: string[];
    expectedSideEffects: string[];
    idempotent: boolean;
    retryable: boolean;
    compensable: boolean;
    expectedLatencyMs: number;
    critical: boolean;
}
export type PipelineId = 'invoice.created' | 'invoice.updated' | 'payment.completed' | 'payment.failed' | 'reminder.requested' | 'reminder.sent' | 'promise.created' | 'promise.broken' | 'promise.fulfilled' | 'recovery.case.created' | 'recovery.case.updated' | 'recovery.case.closed' | 'customer.created' | 'customer.updated' | 'sync.queued' | 'sync.completed' | 'sync.failed' | 'outbox.event.created' | 'outbox.event.processed' | 'outbox.event.dead_letter' | 'dashboard.refreshed' | 'decision.engine.ran' | 'scheduler.tick' | 'projection.delta.emitted';
//# sourceMappingURL=pipelines.d.ts.map