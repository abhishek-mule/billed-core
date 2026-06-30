import type { ActivityItem, WorkContext } from './types';
export interface ActivityEventInput {
    occurredAt: string;
    eventType?: string;
    reason?: string;
    customerName?: string;
    amount?: number;
}
export declare function buildActivity(events: ActivityEventInput[], _context: WorkContext): ActivityItem[];
//# sourceMappingURL=buildActivity.d.ts.map