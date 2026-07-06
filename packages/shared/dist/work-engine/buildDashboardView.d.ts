import type { DashboardView, WorkItem, CashPosition, ActivityItem, AutomationPlanItem } from './types';
export interface DashboardInput {
    work: WorkItem[];
    cash: CashPosition;
    activity: ActivityItem[];
}
export declare function buildDashboardView(input: DashboardInput, automationPlan?: AutomationPlanItem[]): DashboardView;
//# sourceMappingURL=buildDashboardView.d.ts.map