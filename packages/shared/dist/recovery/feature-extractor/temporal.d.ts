import type { NormalizedRecoveryEvent } from '../normalized-event';
import type { MultiResolutionTemporal } from '../histograms';
export interface TemporalFeatures {
    histograms: MultiResolutionTemporal;
    preferredDayOfWeek: number;
    preferredHourRange: {
        start: number;
        end: number;
    };
    salaryWeekBias: 'first' | 'second' | 'last' | 'none';
    monthEndBias: boolean;
    weekendBias: 'prefers_weekend' | 'avoids_weekend' | 'none';
}
export declare function extractTemporalFeatures(events: NormalizedRecoveryEvent[]): TemporalFeatures;
//# sourceMappingURL=temporal.d.ts.map