import type { RecoveryTimelineEvent, RecoveryTimelineData, RecoveryJourney, IntelligenceInsight } from './timeline-types';
export interface RawCollectionAction {
    id: string;
    action_type: string;
    status: string;
    source: string;
    provider?: string;
    amount?: number;
    reason?: string;
    scheduled_at?: string;
    executed_at?: string;
    completed_at?: string;
    created_at: string;
    metadata?: Record<string, unknown>;
}
export interface RawWhatsAppEvent {
    id: string;
    status: string;
    direction: string;
    provider?: string;
    message_type?: string;
    occurred_at: string;
    created_at: string;
    metadata?: Record<string, unknown>;
}
export interface RawInvoice {
    id: string;
    status: string;
    total?: number;
    outstanding_amount?: number;
    due_date?: string;
    created_at: string;
    updated_at: string;
    customer_id?: string;
    customer_name?: string;
}
export interface TimelineBuilderInput {
    invoice: RawInvoice;
    collectionActions: RawCollectionAction[];
    whatsappEvents: RawWhatsAppEvent[];
}
declare function buildJourney(events: RecoveryTimelineEvent[], invoiceStatus: string): RecoveryJourney;
declare function buildInsights(events: RecoveryTimelineEvent[]): IntelligenceInsight[];
export declare function buildRecoveryTimeline(input: TimelineBuilderInput): RecoveryTimelineData;
export { buildJourney, buildInsights };
//# sourceMappingURL=timeline-builder.d.ts.map