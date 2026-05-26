export declare const REMINDER_STAGES: readonly ["t0_soft", "t24_nudge", "t72_strong", "t5_warning"];
export type ReminderStage = (typeof REMINDER_STAGES)[number];
export declare const STAGE_LABELS: Record<ReminderStage, string>;
export declare function normalizeStage(stage: string | null | undefined): ReminderStage;
export declare function getNextStage(current: ReminderStage): ReminderStage;
export type WhatsAppStatus = 'queued' | 'sent' | 'server_ack' | 'delivered' | 'read' | 'clicked_upi' | 'payment_confirmed' | 'failed' | 'rate_limited' | 'received';
export type ProjectionTransportState = 'queued' | 'sent' | 'server_ack' | 'delivered' | 'received' | 'read' | 'failed_terminal';
export type ProjectionDeliveryHealth = 'healthy' | 'retrying' | 'degraded';
export type WhatsAppProvider = 'gupshup' | 'baileys';
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
/**
 * Generate a canonical billzo_message_id using Snowflake-style encoding.
 * Combines Date.now() (shifted left 12 bits) with hrtime low 12 bits
 * for intra-millisecond uniqueness without shared mutable state.
 *
 * Format: bmsg_{base36(snowflake)}
 */
export declare function generateBillzoMessageId(): string;
/**
 * Generate a monotonic event sequence value using the same Snowflake scheme.
 * Sortable by wall-clock order, unique per-call without atomics.
 */
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