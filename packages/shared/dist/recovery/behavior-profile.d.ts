import type { PaymentFeatures } from './feature-extractor/payment';
import type { CommunicationFeatures } from './feature-extractor/communication';
import type { TemporalFeatures } from './feature-extractor/temporal';
import type { RelationshipFeatures } from './feature-extractor/relationship';
import type { DriftReport } from './learning/drift';
import type { FieldConfidenceMap } from './confidence';
export interface ObservedBehavior {
    payment: PaymentFeatures;
    communication: CommunicationFeatures;
    temporal: TemporalFeatures;
    relationship: RelationshipFeatures;
}
export interface LiquidityWindow {
    dayOfWeek: number;
    startHour: number;
    endHour: number;
    confidence: number;
}
export interface DerivedBehavior {
    liquidityWindow: LiquidityWindow;
    riskScore: number;
    stabilityScore: number;
    recoveryDifficulty: 'easy' | 'medium' | 'hard';
}
export interface PredictedBehavior {
    probabilityPayToday: number;
    probabilityIgnoreReminder: number;
    expectedCollectionAmount: number;
}
export interface CustomerBehaviorProfile {
    customerId: string;
    tenantId: string;
    modelVersion: string;
    updatedAt: string;
    eventCount: number;
    observed: ObservedBehavior;
    derived: DerivedBehavior;
    predicted: PredictedBehavior;
    confidence: {
        overall: number;
        fields: FieldConfidenceMap;
    };
    drift: DriftReport | null;
}
export interface BusinessBehaviorProfile {
    tenantId: string;
    modelVersion: string;
    updatedAt: string;
    customerCount: number;
    avgRiskScore: number;
    preferredRecoveryStyle: 'gentle' | 'balanced' | 'aggressive';
    dashboardEngagement: 'daily' | 'weekly' | 'rarely' | 'unknown';
    snoozeRate: number;
    callPreference: boolean;
    busiestCollectionDay: number | null;
    avgReceivableAgeDays: number | null;
    avgRecoveryEfficiency: number | null;
    avgPaymentCycleDays: number | null;
    reminderEffectiveness: number | null;
    cashflowHealth: number | null;
}
export { BusinessBehaviorProfile as MerchantBehaviorProfile };
export declare const CURRENT_MODEL_VERSION = "1.0.0";
export declare function createEmptyCustomerProfile(customerId: string, tenantId: string): CustomerBehaviorProfile;
export declare function createEmptyBusinessProfile(tenantId: string): BusinessBehaviorProfile;
/** @deprecated Use BusinessBehaviorProfile and createEmptyBusinessProfile */
export declare const createEmptyMerchantProfile: typeof createEmptyBusinessProfile;
//# sourceMappingURL=behavior-profile.d.ts.map