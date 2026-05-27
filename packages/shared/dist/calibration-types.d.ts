export interface PredictionOutcome {
    predicted: number;
    actual: 0 | 1;
    metric: 'read_rate' | 'payment_conversion' | 'channel_viability' | 'resolution_probability';
    observationCount: number;
}
export interface CalibrationBin {
    binIndex: number;
    count: number;
    meanPredicted: number;
    actualRate: number;
    residual: number;
}
export interface CalibrationReport {
    metric: string;
    bins: CalibrationBin[];
    ece: number;
    mace: number;
    totalPairs: number;
    condition?: string;
}
//# sourceMappingURL=calibration-types.d.ts.map