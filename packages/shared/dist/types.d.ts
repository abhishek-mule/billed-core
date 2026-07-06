export declare const REMINDER_STAGES: readonly ["t0_soft", "t24_nudge", "t72_strong", "t5_warning"];
export type ReminderStage = (typeof REMINDER_STAGES)[number];
export declare const STAGE_LABELS: Record<ReminderStage, string>;
export declare function normalizeStage(stage: string | null | undefined): ReminderStage;
export declare function getNextStage(current: ReminderStage): ReminderStage;
export type WhatsAppStatus = 'queued' | 'sent' | 'server_ack' | 'delivered' | 'read' | 'clicked_upi' | 'payment_confirmed' | 'failed' | 'rate_limited' | 'received';
export type ProjectionTransportState = 'queued' | 'sent' | 'server_ack' | 'delivered' | 'received' | 'read' | 'failed_terminal';
export type ProjectionDeliveryHealth = 'healthy' | 'retrying' | 'degraded';
export type WhatsAppProvider = 'gupshup' | 'baileys';
export type AutomationMode = 'full_auto' | 'manual' | 'muted';
export declare const MESSAGE_ORIGINS: readonly ["automation", "manual", "webhook", "system"];
export type MessageOrigin = (typeof MESSAGE_ORIGINS)[number];
export interface MessageIdentity {
    billzoMessageId: string;
    conversationId: string;
    messageOrigin: MessageOrigin;
    parentBillzoMessageId: string | null;
    transportMessageHash: string;
    eventSequence: bigint;
    attemptNumber: number;
    reminderStage: string | null;
}
export declare function generateBillzoMessageId(): string;
export declare function generateEventSequence(): bigint;
/**
 * Compute a transport-level message hash for dedup and reconciliation.
 * Uses MD5 (fast, not cryptographic) over canonical fields.
 *
 * Retry safety: includes reminderStage + attemptNumber so retries
 * within the same minute-bucket produce distinct hashes.
 */
export declare function computeTransportHash(params: {
    phone: string;
    message: string;
    invoiceId?: string | null;
    amount?: number;
    reminderStage?: string | null;
    attemptNumber?: number;
}): string;
export type InvoiceStatus = 'paid' | 'partial' | 'unpaid' | 'overdue';
export declare const INVOICE_RECOVERY_STATES: readonly ["pending", "scheduled", "paused", "manual_review", "completed", "disputed"];
export type InvoiceRecoveryState = (typeof INVOICE_RECOVERY_STATES)[number];
export declare function isOverdue(status: InvoiceStatus, dueDate: string | Date | null | undefined, now?: Date): boolean;
export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'failed' | 'conflict' | 'dead_letter';
export declare const RECOVERY_STATES: readonly ["created", "due_soon", "overdue_soft", "overdue_engaged", "overdue_ignored", "high_risk", "escalated", "recovered", "failed"];
export type RecoveryState = (typeof RECOVERY_STATES)[number];
export declare const RECOVERY_ENGAGEMENT_STATES: readonly ["unseen", "attention", "engaged", "intent", "likely_to_pay", "ghosting", "failed"];
export type RecoveryEngagementState = (typeof RECOVERY_ENGAGEMENT_STATES)[number];
export interface OperatingHoursConfig {
    enabled: boolean;
    windows: Array<{
        start: string;
        end: string;
    }>;
    quietDays: number[];
    quietAfter: string;
}
export declare const DEFAULT_OPERATING_HOURS: OperatingHoursConfig;
export type ObservationSource = 'transport' | 'payment' | 'merchant_action' | 'system_inference';
export type ObservationType = 'message_seen' | 'attention_absent' | 'response_absent' | 'resolution_absent' | 'payment_intent' | 'resolution_completed' | 'channel_failure';
export interface BehavioralObservation {
    type: ObservationType;
    confidence: number;
    source: ObservationSource;
    sourceReliability: number;
    interpreterVersion: string;
    occurredAt: string;
    tenantId: string;
    customerId: string;
    invoiceId?: string;
    absenceWindowHours?: number;
    metadata?: Record<string, unknown>;
}
export interface ProjectionDelta {
    tenantId: string;
    customerId: string;
    invoiceId: string;
    billzoMessageId: string;
    transportState: string;
    deliveryHealth: string;
    prevTransportState: string | null;
    prevDeliveryHealth: string | null;
    occurredAt: string;
    prevOccurredAt: string | null;
}
export interface ProfileChanged {
    tenantId: string;
    customerId: string;
    changedFields: string[];
    confidenceBefore: number;
    confidenceAfter: number;
    traitChanges?: Record<string, number>;
    occurredAt: string;
}
export interface CustomerBehavioralMetrics {
    tenantId: string;
    customerId: string;
    schemaVersion: number;
    readRate: number;
    paymentConversionRate: number;
    avgReadToPayHours: number;
    avgReminderResponseHours: number;
    avgSettlementLatencyHours: number;
    observationCount: number;
    totalInterventionsSent: number;
    totalInterventionsRead: number;
    totalResolutionsAfterIntervention: number;
    totalEscalationsReceived: number;
    lastEscalationAt: string | null;
    interventionsUntilResolution: number | null;
    lastResolutionAt: string | null;
    lastReadAt: string | null;
    lastResponseAt: string | null;
    lastEventAt: string | null;
    updatedAt: string;
}
export interface CustomerLiquidityWindow {
    tenantId: string;
    customerId: string;
    schemaVersion: number;
    windowType: string;
    weekday: number;
    hourBucket: number;
    affinityScore: number;
    observationCount: number;
    lastSeenAt: string | null;
}
export interface TraitValue {
    value: number;
    priorSource: ResolvedPrior['source'];
    evidenceWeight: number;
}
export interface BehavioralTraits {
    temporalRegularity: TraitValue;
    constraintAffinity: TraitValue;
    strategicDelayLikelihood: TraitValue;
    disputeRisk: TraitValue;
    channelViability: TraitValue;
}
export interface TemporalPrior {
    weekdayDistribution: number[];
    hourDistribution: number[];
    interventionLatencyDistribution: number[];
    observationCount: number;
    effectiveWeight: number;
}
export type PriorSource = 'customer' | 'segment' | 'tenant' | 'global' | 'none';
export interface ResolvedPrior {
    source: PriorSource;
    prior: TemporalPrior | null;
}
export interface BehavioralRecommendationContext {
    tenantId: string;
    customerId: string;
    traits: BehavioralTraits;
    readRate: number;
    channelViability: number;
    entropy: number;
    priorSource: PriorSource;
    observationCount: number;
    updatedAt: string;
}
export declare const DECAY_HALF_LIVES: {
    readonly readRate: 30;
    readonly paymentConversion: 45;
    readonly readToPayLatency: 45;
    readonly reminderResponseLatency: 30;
    readonly settlementLatency: 60;
    readonly liquidityWindowAffinity: 60;
    readonly channelViability: 21;
    readonly escalationSensitivity: 120;
};
export declare const INTERPRETER_VERSION = "1.0.0";
export interface TenantWhatsAppConfig {
    gupshupApiKey?: string;
    gupshupAppName?: string;
    sourceNumber?: string;
    whatsappProvider?: WhatsAppProvider;
    autoSend: boolean;
    paymentLinkEnabled: boolean;
    paymentLinkExpiry: number;
    optInMessage?: string;
    templateNames: {
        invoice?: string;
        reminderGentle?: string;
        reminderFirm?: string;
        receipt?: string;
        udharGentle?: string;
        udharFirm?: string;
    };
    operatingHours?: OperatingHoursConfig;
}
//# sourceMappingURL=types.d.ts.map