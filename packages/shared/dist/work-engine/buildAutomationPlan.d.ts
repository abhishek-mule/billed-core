import type { QueueCaseInput } from './buildTodayWork';
import type { UpcomingReminder } from '../repositories/recovery';
import type { AutomationPlanItem } from './types';
export declare function buildAutomationPlan(cases: QueueCaseInput[], upcoming: UpcomingReminder[]): AutomationPlanItem[];
export declare function formatPlanTime(iso?: string): string | undefined;
//# sourceMappingURL=buildAutomationPlan.d.ts.map