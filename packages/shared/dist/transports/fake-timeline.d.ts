export interface TimelineEvent {
    id: string;
    type: string;
    customerId: string;
    tenantId: string;
    payload: Record<string, unknown>;
    occurredAt: string;
}
export declare class FakeTimeline {
    readonly name = "fake";
    events: TimelineEvent[];
    addEvent(event: Omit<TimelineEvent, 'occurredAt'>): Promise<void>;
    getEventsForCustomer(customerId: string): TimelineEvent[];
    getEventsByType(type: string): TimelineEvent[];
    getEventCount(): number;
    clear(): void;
}
//# sourceMappingURL=fake-timeline.d.ts.map