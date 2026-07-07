export declare const ACTION_TYPES: readonly ["reminder", "payment_request", "call", "visit", "escalate", "wait"];
export type ActionType = (typeof ACTION_TYPES)[number];
export declare const ACTION_STATUSES: readonly ["scheduled", "in_progress", "completed", "failed", "cancelled", "expired"];
export type ActionStatus = (typeof ACTION_STATUSES)[number];
export declare const ACTION_SOURCES: readonly ["system", "worker", "merchant", "customer"];
export type ActionSource = (typeof ACTION_SOURCES)[number];
export declare const RECOVERY_GOALS: readonly ["full_payment", "partial_payment", "engagement", "relationship_preservation"];
export type RecoveryGoal = (typeof RECOVERY_GOALS)[number];
export interface RecoveryPlanDecisionReason {
    modelVersion: string;
    keyFeatures: string[];
    confidence: number;
    customerRiskScore: number;
    liquidityWindow: {
        dayOfWeek: number;
        startHour: number;
        endHour: number;
    } | null;
    driftDetected: boolean;
}
export interface RecoveryPlan {
    actionType: ActionType;
    goal: RecoveryGoal;
    suggestedAmount?: number;
    confidence: number;
    priority: number;
    timing: RecoveryTiming;
    reason: string;
    decisionReason: RecoveryPlanDecisionReason;
}
export interface RecoveryTiming {
    immediate: boolean;
    scheduledAt?: string;
    delayMinutes?: number;
}
export interface ActionPlan {
    actionType: ActionType;
    provider: string | null;
    amount?: number;
    config: Record<string, unknown>;
}
export interface CollectionAction {
    id: string;
    tenantId: string;
    customerId?: string;
    invoiceIds: string[];
    actionType: ActionType;
    status: ActionStatus;
    source: ActionSource;
    provider?: string;
    amount?: number;
    scheduledAt?: string;
    executedAt?: string;
    completedAt?: string;
    parentActionId?: string;
    recoveryPlanId?: string;
    reason?: string;
    priority: number;
    metadata: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
}
export declare const REMINDER_STRATEGIES: readonly ["gentle", "balanced", "aggressive"];
export type ReminderStrategy = (typeof REMINDER_STRATEGIES)[number];
export interface MerchantPolicy {
    reminderStrategy: ReminderStrategy;
    escalationEnabled: boolean;
    allowCalls: boolean;
    preferredChannels: string[];
    paymentPreference: string[];
    relationshipPriority: number;
    maxRemindersPerMonth: number;
    maxRemindersPerInvoice: number;
    cooldownHours: number;
}
export interface CustomerPolicyOverride {
    escalationEnabled?: boolean;
    preferredChannels?: string[];
    reminderStrategy?: ReminderStrategy;
    allowCalls?: boolean;
}
//# sourceMappingURL=types.d.ts.map