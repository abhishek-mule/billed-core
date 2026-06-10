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
}
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
    };
    customer: {
        id: string;
        phone: string | null;
        customerTier: CustomerTier;
        automationMode: string;
        phoneVerification: PhoneVerificationStatus;
        reputationScore: number;
    };
    activePromiseDate?: string | null;
    behaviorMetrics?: {
        readRate: number;
        deliveryRate: number;
        observationCount: number;
    };
    now?: string;
}
export declare const TIER_MAX_STAGE: Record<CustomerTier, string>;
//# sourceMappingURL=decision-engine-types.d.ts.map