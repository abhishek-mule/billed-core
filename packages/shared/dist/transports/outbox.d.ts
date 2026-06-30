export interface OutboxEvent {
    id: string;
    type: string;
    tenantId: string;
    aggregateType: string;
    aggregateId: string;
    payload: Record<string, unknown>;
    status: 'pending' | 'processing' | 'processed' | 'dead_letter';
    createdAt: string;
    processedAt?: string;
}
export interface OutboxPublisher {
    publish(event: Omit<OutboxEvent, 'status' | 'createdAt' | 'processedAt'>): Promise<string>;
    getStatus(eventId: string): Promise<OutboxEvent | null>;
    name: string;
}
//# sourceMappingURL=outbox.d.ts.map