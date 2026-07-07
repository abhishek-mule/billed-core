import type { NormalizedRecoveryEvent } from './normalized-event';
import type { CustomerBehaviorProfile, BusinessBehaviorProfile } from './behavior-profile';
import type { PaymentFeatures, CommunicationFeatures, TemporalFeatures, RelationshipFeatures, RiskFeatures } from './feature-extractor';
import type { DriftConfig } from './learning/drift';
export interface LearningEngineInput {
    customerEvents: NormalizedRecoveryEvent[];
    merchantEvents: NormalizedRecoveryEvent[];
    previousProfile: CustomerBehaviorProfile | null;
    previousBusinessProfile: BusinessBehaviorProfile | null;
    merchantPrior: {
        alpha: number;
        beta: number;
    } | null;
    industryPrior: {
        alpha: number;
        beta: number;
    } | null;
    driftConfig?: DriftConfig;
}
export interface LearningEngineExplanation {
    summary: string;
    keyFeatures: string[];
    liquidityWindow: {
        dayOfWeek: number;
        startHour: number;
        endHour: number;
    } | null;
    riskScore: number;
    stabilityScore: number;
    confidence: number;
    modelVersion: string;
    driftDetected: boolean;
}
export interface LearningEngineOutput {
    customerProfile: CustomerBehaviorProfile;
    businessProfile: BusinessBehaviorProfile;
    recomputedAt: string;
    explanation: LearningEngineExplanation;
    features: {
        payment: PaymentFeatures;
        communication: CommunicationFeatures;
        temporal: TemporalFeatures;
        relationship: RelationshipFeatures;
        risk: RiskFeatures;
    };
}
export declare class LearningEngine {
    compute(input: LearningEngineInput): LearningEngineOutput;
    private buildExplanation;
    private computeBusinessProfile;
}
//# sourceMappingURL=learning-engine.d.ts.map