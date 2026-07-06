import { FakeMessageTransport } from './fake-message';
import { FakeScheduler } from './fake-scheduler';
import { FakeClock } from './fake-clock';
import { FakeOutboxPublisher } from './fake-outbox';
import { FakeDecisionEngine } from './fake-decision-engine';
import { FakeRecoveryProjection } from './fake-recovery-projection';
import { FakeDashboardProjection } from './fake-dashboard-projection';
import { FakeTimeline } from './fake-timeline';
import { FakeWorker } from './fake-worker';
import type { PipelineId } from '../system/pipelines';
export interface TestHarnessDeps {
    message?: FakeMessageTransport;
    scheduler?: FakeScheduler;
    clock?: FakeClock;
    outbox?: FakeOutboxPublisher;
    decisionEngine?: FakeDecisionEngine;
    recovery?: FakeRecoveryProjection;
    dashboard?: FakeDashboardProjection;
    timeline?: FakeTimeline;
    worker?: FakeWorker;
}
export declare class SystemTestHarness {
    readonly message: FakeMessageTransport;
    readonly scheduler: FakeScheduler;
    readonly clock: FakeClock;
    readonly outbox: FakeOutboxPublisher;
    readonly decisionEngine: FakeDecisionEngine;
    readonly recovery: FakeRecoveryProjection;
    readonly dashboard: FakeDashboardProjection;
    readonly timeline: FakeTimeline;
    readonly worker: FakeWorker;
    readonly pipelineRegistry: Record<PipelineId, import("../system/pipelines").PipelineContract<unknown>>;
    private pipelineEvents;
    private msgIndex;
    constructor(deps?: TestHarnessDeps);
    private registerDefaultHandlers;
    getPipeline(id: PipelineId): import("../system/pipelines").PipelineContract<unknown>;
    recordEvent(pipelineId: PipelineId, type: string, payload: Record<string, unknown>): void;
    getRecordedEvents(): {
        pipelineId: PipelineId;
        type: string;
        payload: Record<string, unknown>;
    }[];
    getEventsForPipeline(id: PipelineId): {
        pipelineId: PipelineId;
        type: string;
        payload: Record<string, unknown>;
    }[];
    clearRecordedEvents(): void;
    expectPipeline(id: PipelineId): PipelineExpectation;
    reset(): void;
}
export declare class PipelineExpectation {
    private harness;
    private pipelineId;
    private produceChecks;
    private consumeChecks;
    private updateChecks;
    private projectChecks;
    private withDuplicate;
    private withRetry;
    constructor(harness: SystemTestHarness, pipelineId: PipelineId);
    toProduce(component: string): this;
    toBeConsumedBy(component: string): this;
    toUpdate(entity: string): this;
    toProject(target: string): this;
    verify(): void;
}
export declare function createTestHarness(deps?: TestHarnessDeps): SystemTestHarness;
//# sourceMappingURL=test-harness.d.ts.map