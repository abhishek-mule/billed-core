import type { NormalizedRecoveryEvent } from '../normalized-event';
export interface CommunicationFeatures {
    readRate: number;
    ignoreRate: number;
    clickToPayLatencyHours: number;
    responseDelayHours: number;
    totalRemindersSent: number;
    totalReads: number;
    totalClicks: number;
}
export declare function extractCommunicationFeatures(events: NormalizedRecoveryEvent[]): CommunicationFeatures;
//# sourceMappingURL=communication.d.ts.map