import type { WorkItem, WorkContext } from './types';
export interface QueueCaseInput {
    caseId: string;
    customerId: string;
    customerName: string;
    phone: string;
    totalOverdue: number;
    oldestOverdueDays: number;
    nextActionType: string;
    promiseToPayDate: string | null;
    ignoredReminders: number;
    brokenPromises: number;
}
export declare function buildTodayWork(cases: QueueCaseInput[], context: WorkContext): WorkItem[];
//# sourceMappingURL=buildTodayWork.d.ts.map