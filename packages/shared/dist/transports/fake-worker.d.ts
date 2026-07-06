import { FakeOutboxPublisher } from './fake-outbox';
import { FakeRecoveryProjection } from './fake-recovery-projection';
import { FakeDashboardProjection } from './fake-dashboard-projection';
import { FakeTimeline } from './fake-timeline';
import { FakeDecisionEngine } from './fake-decision-engine';
import { FakeMessageTransport } from './fake-message';
import type { PipelineId } from '../system/pipelines';
export interface WorkerEvent {
    outboxEventId: string;
    pipelineId: PipelineId;
    processedAt: string;
    success: boolean;
    error?: string;
}
export declare class FakeWorker {
    private outbox;
    private recovery;
    private dashboard;
    private timeline;
    private decisionEngine;
    private message;
    readonly name = "fake";
    processed: WorkerEvent[];
    failNext: boolean;
    simulateCrashOnNext: boolean;
    private callbacks;
    constructor(outbox: FakeOutboxPublisher, recovery: FakeRecoveryProjection, dashboard: FakeDashboardProjection, timeline: FakeTimeline, decisionEngine: FakeDecisionEngine, message: FakeMessageTransport);
    onPipeline(id: string, handler: (event: {
        type: string;
        payload: Record<string, unknown>;
    }) => Promise<void>): void;
    processNext(): Promise<WorkerEvent | null>;
    processAll(): Promise<WorkerEvent[]>;
    getProcessedCount(): number;
    getSuccessCount(): number;
    getFailureCount(): number;
    clear(): void;
}
//# sourceMappingURL=fake-worker.d.ts.map