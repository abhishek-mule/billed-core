import type { Scheduler, ScheduledJob } from './scheduler';
export declare class FakeScheduler implements Scheduler {
    readonly name = "fake";
    private jobs;
    private autoFire;
    setAutoFire(fire: boolean): void;
    schedule(job: Omit<ScheduledJob, 'fired' | 'firedAt'>): Promise<void>;
    cancel(jobId: string): Promise<void>;
    list(): Promise<ScheduledJob[]>;
    fire(jobId: string): Promise<void>;
    fireAll(): Promise<void>;
    getPending(): ScheduledJob[];
    getFired(): ScheduledJob[];
    clear(): void;
}
//# sourceMappingURL=fake-scheduler.d.ts.map