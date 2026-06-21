export declare const RECOVERY_STATES_V2: readonly ["active", "overdue", "partial_payment", "promised", "recovered", "disputed", "closed"];
export type RecoveryStateV2 = (typeof RECOVERY_STATES_V2)[number];
export declare const RECOVERY_STATE_PRECEDENCE: Record<RecoveryStateV2, number>;
export declare const ENGAGEMENT_STATES_V2: readonly ["unseen", "engaged", "intent", "likely_to_pay", "ghosting", "snoozed"];
export type EngagementStateV2 = (typeof ENGAGEMENT_STATES_V2)[number];
export declare const NEXT_ACTION_TYPES: readonly ["send_reminder", "review_payment", "follow_up_call", "wait", "merchant_review"];
export type NextActionType = (typeof NEXT_ACTION_TYPES)[number];
export interface RecoveryCase {
    id: string;
    tenantId: string;
    customerId: string;
    invoiceCount: number;
    openInvoiceCount: number;
    overdueInvoiceCount: number;
    disputedInvoiceCount: number;
    promisedInvoiceCount: number;
    totalOutstanding: number;
    totalOverdue: number;
    recoveryState: RecoveryStateV2;
    engagementState: EngagementStateV2;
    nextActionType: NextActionType | null;
    nextActionDueAt: string | null;
    lastActivityAt: string | null;
    promiseToPayDate: string | null;
    attentionScore: number;
    version: number;
    createdAt: string;
    updatedAt: string;
}
export interface RecoveryCaseEvent {
    id: string;
    caseId: string;
    eventType: 'transition' | 'backfill' | 'override';
    fromRecoveryState: RecoveryStateV2 | null;
    toRecoveryState: RecoveryStateV2 | null;
    fromEngagementState: EngagementStateV2 | null;
    toEngagementState: EngagementStateV2 | null;
    reason: string;
    trigger: Record<string, unknown>;
    occurredAt: string;
}
export interface RecoveryCaseEventConsumption {
    sourceEventId: string;
    caseId: string;
    processedAt: string;
}
export interface RecoveryFinancialState {
    totalOutstanding: number;
    totalOverdue: number;
    openInvoiceCount: number;
    overdueInvoiceCount: number;
    disputedInvoiceCount: number;
    promisedInvoiceCount: number;
    invoiceCount: number;
}
export interface RecoveryCaseTransition {
    caseId: string;
    recoveryState?: RecoveryStateV2;
    engagementState?: EngagementStateV2;
    nextActionType?: NextActionType | null;
    nextActionDueAt?: string | null;
    promiseToPayDate?: string | null;
    attentionScore?: number;
    version: number;
    financialState: RecoveryFinancialState;
    event: Omit<RecoveryCaseEvent, 'id' | 'occurredAt'>;
}
export declare function deriveRecoveryState(invoices: {
    status: string;
    dueDate?: string | null;
}[]): RecoveryStateV2;
export declare function computeAttentionScore(params: {
    overdueDays: number;
    totalOverdue: number;
    linkClicked: boolean;
    promiseBroken: boolean;
    paymentDetected: boolean;
}): number;
//# sourceMappingURL=recovery-case.d.ts.map