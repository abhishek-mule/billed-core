import type { NormalizedRecoveryEvent } from '../normalized-event';
import type { RelationshipFeatures } from './relationship';
export interface RiskFeatures {
    riskScore: number;
    defaultProbability: number;
    recoveryDifficulty: 'easy' | 'medium' | 'hard';
    stabilityScore: number;
}
export declare function extractRiskFeatures(events: NormalizedRecoveryEvent[], relationship: RelationshipFeatures): RiskFeatures;
//# sourceMappingURL=risk.d.ts.map