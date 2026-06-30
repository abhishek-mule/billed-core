import type { TimelineItem } from './types';
export interface TimelineEventInput {
    id: string;
    type: 'reminder' | 'promise' | 'payment' | 'call' | 'system';
    label: string;
    detail: string;
    amount?: number;
    occurredAt: string;
}
export declare function buildTimeline(events: TimelineEventInput[]): TimelineItem[];
//# sourceMappingURL=buildTimeline.d.ts.map