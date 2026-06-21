export declare const CUSTOMER_TIERS: readonly ["vip", "regular", "risky", "blacklisted"];
export type CustomerTier = (typeof CUSTOMER_TIERS)[number];
export declare const PHONE_VERIFICATION_STATUSES: readonly ["verified", "unverified", "unknown"];
export type PhoneVerificationStatus = (typeof PHONE_VERIFICATION_STATUSES)[number];
export type Decision = 'send' | 'block' | 'pending_approval';
export interface DecisionRuleResult {
    rule: string;
    passed: boolean;
    detail: string;
    override?: boolean;
    overrideReason?: string;
}
export interface CanSendReminderOutput {
    allowed: boolean;
    decision: Decision;
    reason: string;
    confidence: number;
    rules: DecisionRuleResult[];
    rulesSnapshot: Record<string, boolean>;
    checksPassed: number;
    totalChecks: number;
    nextReviewAt: string | null;
    merchantInterventionTriggered: boolean;
    interventionReason?: string;
    recommendedAction?: 'send' | 'skip' | 'flag_merchant' | 'switch_channel';
}
export declare const ANNOVER_THRESHOLDS: {
    maxRemindersPerMonth: number;
    maxConsecutiveIgnores: number;
    silenceDaysAfterIgnore: number;
    maxRemindersPerInvoice: number;
    annoyanceCooldownDays: number;
    merchantInterventionIgnores: number;
};
export interface CanSendReminderInput {
    invoice: {
        id: string;
        total: number;
        outstanding: number;
        recoveryStage: string;
        nextRecoveryAt: string | null;
        isSnoozed: boolean;
        snoozeUntil: string | null;
        isDisputed: boolean;
        manualInteractionAt: string | null;
        overrideSend: boolean;
        overrideAt: string | null;
        overrideReason: string | null;
        lastReminderAt?: string | null;
        reminderCount?: number;
    };
    customer: {
        id: string;
        phone: string | null;
        customerTier: CustomerTier;
        automationMode: string;
        phoneVerification: PhoneVerificationStatus;
        reputationScore: number;
        engagementState?: string;
    };
    activePromiseDate?: string | null;
    reminderHistory?: {
        totalSent: number;
        sentThisMonth: number;
        lastReminderAt: string | null;
        consecutiveIgnores: number;
        lastReadAt: string | null;
        linkClicked: boolean;
        hoursSinceLastCustomerReminder: number;
    };
    behaviorMetrics?: {
        readRate: number;
        deliveryRate: number;
        observationCount: number;
    };
    now?: string;
    timezone?: string;
}
export declare const TIER_MAX_STAGE: Record<CustomerTier, string>;
//# sourceMappingURL=decision-engine-types.d.ts.map