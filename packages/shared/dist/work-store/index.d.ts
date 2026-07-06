import type { AnyDashboardSection, BusinessInsight } from '../work-engine/types';
import type { CustomerPageView } from '../work-engine/buildCustomerPage';
import type { MerchantMemory } from '../work-engine/types';
import type { LoadCustomerSnapshot } from '../repositories/customer';
import type { LoadQueueCases, LoadUpcomingReminders } from '../repositories/recovery';
import type { LoadRecentActivity } from '../repositories/activity';
import type { LoadFinancialSummary } from '../repositories/finance';
export interface MerchantMemoriesResult {
    memories: MerchantMemory[];
    insights: BusinessInsight[];
}
export type LoadMerchantMemories = () => Promise<MerchantMemoriesResult>;
export interface WorkStoreDeps {
    loadCustomerSnapshot: LoadCustomerSnapshot;
    loadQueueCases: LoadQueueCases;
    loadRecentActivity: LoadRecentActivity;
    loadFinancialSummary: LoadFinancialSummary;
    loadMerchantMemories?: LoadMerchantMemories;
    loadUpcomingReminders?: LoadUpcomingReminders;
}
export interface WorkStore {
    getDashboard(): Promise<{
        sections: AnyDashboardSection[];
    }>;
    getCustomer(id: string): Promise<CustomerPageView>;
}
export declare function createWorkStore(deps: WorkStoreDeps): WorkStore;
//# sourceMappingURL=index.d.ts.map