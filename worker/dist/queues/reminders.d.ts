import { Worker, Queue } from 'bullmq';
interface ReminderJobData {
    invoiceId: string;
    tenantId: string;
    stage: string;
}
export declare function createRemindersWorker(): Worker<ReminderJobData, any, string>;
export declare function createReminderQueue(): Queue<ReminderJobData, any, string, ReminderJobData, any, string>;
export declare function enqueueOverdueReminders(): Promise<number>;
export {};
//# sourceMappingURL=reminders.d.ts.map