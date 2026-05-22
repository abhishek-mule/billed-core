export interface WorkerLogEntry {
    event_id?: string;
    tenant_id: string;
    entity_id?: string | null;
    correlation_id?: string | null;
    causation_id?: string | null;
    queue_name: string;
    attempt: number;
    status: 'success' | 'failed' | 'pending' | 'retry';
    duration_ms: number;
    timestamp: string;
    level: 'info' | 'warn' | 'error';
    message: string;
    metadata?: Record<string, unknown>;
}
export declare function logWorkerEvent(entry: WorkerLogEntry): void;
export declare function logWorkerError(error: Error, context: Partial<WorkerLogEntry>): void;
//# sourceMappingURL=logging.d.ts.map