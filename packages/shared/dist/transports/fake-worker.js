"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FakeWorker = void 0;
class FakeWorker {
    constructor(outbox, recovery, dashboard, timeline, decisionEngine, message) {
        this.outbox = outbox;
        this.recovery = recovery;
        this.dashboard = dashboard;
        this.timeline = timeline;
        this.decisionEngine = decisionEngine;
        this.message = message;
        this.name = 'fake';
        this.processed = [];
        this.failNext = false;
        this.simulateCrashOnNext = false;
        this.callbacks = new Map();
    }
    onPipeline(id, handler) {
        this.callbacks.set(id, handler);
    }
    async processNext() {
        const pending = this.outbox.getPending();
        if (pending.length === 0)
            return null;
        const event = pending[0];
        this.outbox.markProcessed(event.id, 'processing');
        if (this.simulateCrashOnNext) {
            this.simulateCrashOnNext = false;
            const crashEvent = {
                outboxEventId: event.id,
                pipelineId: event.type,
                processedAt: new Date().toISOString(),
                success: false,
                error: 'Simulated crash',
            };
            this.processed.push(crashEvent);
            // Leave status as 'processing' to simulate crash before finalizing
            return crashEvent;
        }
        if (this.failNext) {
            this.failNext = false;
            this.outbox.markProcessed(event.id, 'dead_letter');
            const failEvent = {
                outboxEventId: event.id,
                pipelineId: event.type,
                processedAt: new Date().toISOString(),
                success: false,
                error: 'Simulated processing failure',
            };
            this.processed.push(failEvent);
            return failEvent;
        }
        try {
            const handler = this.callbacks.get(event.type);
            if (handler) {
                await handler({ type: event.type, payload: event.payload });
            }
            this.outbox.markProcessed(event.id, 'processed');
            const successEvent = {
                outboxEventId: event.id,
                pipelineId: event.type,
                processedAt: new Date().toISOString(),
                success: true,
            };
            this.processed.push(successEvent);
            return successEvent;
        }
        catch (err) {
            this.outbox.markProcessed(event.id, 'dead_letter');
            const failEvent = {
                outboxEventId: event.id,
                pipelineId: event.type,
                processedAt: new Date().toISOString(),
                success: false,
                error: String(err),
            };
            this.processed.push(failEvent);
            return failEvent;
        }
    }
    async processAll() {
        const results = [];
        let next = await this.processNext();
        while (next) {
            results.push(next);
            next = await this.processNext();
        }
        return results;
    }
    getProcessedCount() {
        return this.processed.length;
    }
    getSuccessCount() {
        return this.processed.filter(e => e.success).length;
    }
    getFailureCount() {
        return this.processed.filter(e => !e.success).length;
    }
    clear() {
        this.processed = [];
        this.failNext = false;
        this.simulateCrashOnNext = false;
        this.callbacks.clear();
    }
}
exports.FakeWorker = FakeWorker;
//# sourceMappingURL=fake-worker.js.map