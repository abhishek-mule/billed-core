import type { AnyDashboardSection } from '../work-engine/types';
import type { CustomerPageView } from '../work-engine/buildCustomerPage';
import type { LoadCustomerSnapshot } from '../repositories/customer';
import type { LoadQueueCases } from '../repositories/recovery';
import type { LoadRecentActivity } from '../repositories/activity';
import type { LoadFinancialSummary } from '../repositories/finance';
export interface WorkStoreDeps {
    loadCustomerSnapshot: LoadCustomerSnapshot;
    loadQueueCases: LoadQueueCases;
    loadRecentActivity: LoadRecentActivity;
    loadFinancialSummary: LoadFinancialSummary;
}
export interface WorkStore {
    getDashboard(): Promise<{
        sections: AnyDashboardSection[];
    }>;
    getCustomer(id: string): Promise<CustomerPageView>;
}
export declare function createWorkStore(deps: WorkStoreDeps): WorkStore;
//# sourceMappingURL=index.d.ts.map