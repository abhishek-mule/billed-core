import type { ProbabilityDistribution } from '../histograms';
export interface DriftConfig {
    warningThreshold: number;
    criticalThreshold: number;
    minimumSamples: number;
}
export declare const DEFAULT_DRIFT_CONFIG: DriftConfig;
export interface DriftReport {
    hasDrifted: boolean;
    severity: 'none' | 'warning' | 'critical';
    divergence: number;
    changedFields: string[];
    detectedAt: string;
}
export declare function detectHistogramDrift(current: ProbabilityDistribution[], historical: ProbabilityDistribution[], fieldNames: string[], config?: DriftConfig): DriftReport;
//# sourceMappingURL=drift.d.ts.map