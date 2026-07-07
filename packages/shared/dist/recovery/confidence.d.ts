export interface FieldConfidenceMap {
    [field: string]: number;
}
export interface ConfidenceConfig {
    minimumSamples: number;
    highThreshold: number;
    mediumThreshold: number;
}
export declare function computeFieldConfidence(sampleCount: number, variance: number, config?: ConfidenceConfig): number;
export declare function computeOverallConfidence(fieldConfidences: FieldConfidenceMap): number;
export declare function classifyConfidence(score: number, config?: ConfidenceConfig): 'high' | 'medium' | 'low';
//# sourceMappingURL=confidence.d.ts.map