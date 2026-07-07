import type { NormalizedRecoveryEvent } from './normalized-event';
export type ProbabilityDistribution = number[];
export interface MultiResolutionTemporal {
    hourOfDay: ProbabilityDistribution;
    dayOfWeek: ProbabilityDistribution;
    weekOfMonth: ProbabilityDistribution;
    month: ProbabilityDistribution;
}
export declare function extractHourOfDay(events: NormalizedRecoveryEvent[]): ProbabilityDistribution;
export declare function extractDayOfWeek(events: NormalizedRecoveryEvent[]): ProbabilityDistribution;
export declare function extractWeekOfMonth(events: NormalizedRecoveryEvent[]): ProbabilityDistribution;
export declare function extractMonth(events: NormalizedRecoveryEvent[]): ProbabilityDistribution;
export declare function buildMultiResolutionTemporal(events: NormalizedRecoveryEvent[]): MultiResolutionTemporal;
export declare function jsDivergence(p: ProbabilityDistribution, q: ProbabilityDistribution): number;
//# sourceMappingURL=histograms.d.ts.map