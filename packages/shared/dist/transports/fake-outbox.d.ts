import type { OutboxPublisher, OutboxEvent } from './outbox';
export declare class FakeOutboxPublisher implements OutboxPublisher {
    readonly name = "fake";
    private events;
    private failNext;
    setFailNext(fail: boolean): void;
    publish(event: Omit<OutboxEvent, 'status' | 'createdAt' | 'processedAt'>): Promise<string>;
    getStatus(eventId: string): Promise<OutboxEvent | null>;
    markProcessed(eventId: string, status: 'processed' | 'dead_letter'): void;
    getEvents(): OutboxEvent[];
    getPending(): OutboxEvent[];
    clear(): void;
}
//# sourceMappingURL=fake-outbox.d.ts.map