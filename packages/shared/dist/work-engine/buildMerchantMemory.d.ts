import type { CustomerBehavioralMetrics, CustomerLiquidityWindow } from '../types';
import type { MerchantMemory } from './types';
export interface MemoryInput {
    metrics: CustomerBehavioralMetrics | null;
    liquidityWindows: CustomerLiquidityWindow[];
}
export declare function buildMerchantMemory(input: MemoryInput): MerchantMemory[];
//# sourceMappingURL=buildMerchantMemory.d.ts.map