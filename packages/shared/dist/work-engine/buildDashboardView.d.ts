import type { DashboardView, WorkItem, CashPosition, ActivityItem } from './types';
export interface DashboardInput {
    work: WorkItem[];
    cash: CashPosition;
    activity: ActivityItem[];
}
export declare function buildDashboardView(input: DashboardInput): DashboardView;
//# sourceMappingURL=buildDashboardView.d.ts.map