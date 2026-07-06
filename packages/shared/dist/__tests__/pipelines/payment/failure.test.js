"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const test_harness_1 = require("../../../transports/test-harness");
(0, vitest_1.describe)('Payment Pipeline — failure', () => {
    let harness;
    const customerId = 'cust-003';
    const tenantId = 'tenant-test';
    const caseId = `case-${customerId}`;
    (0, vitest_1.beforeEach)(() => {
        harness = (0, test_harness_1.createTestHarness)();
    });
    (0, vitest_1.it)('sends payment to dead letter when worker fails', async () => {
        await harness.recovery.createCase({
            caseId,
            customerId,
            tenantId,
            totalOverdue: 5000,
            status: 'active',
            nextActionType: 'send_reminder',
            brokenPromises: 0,
            ignoredReminders: 0,
            automationMode: 'auto',
            updatedAt: new Date().toISOString(),
        });
        const eventId = await harness.outbox.publish({
            id: 'pay-fail-001',
            type: 'payment.completed',
            tenantId,
            aggregateType: 'payment',
            aggregateId: 'pay-fail-001',
            payload: { customerId, amount: 2000, tenantId, paymentMethod: 'cash' },
        });
        harness.worker.failNext = true;
        const result = await harness.worker.processNext();
        (0, vitest_1.expect)(result).not.toBeNull();
        (0, vitest_1.expect)(result.success).toBe(false);
        (0, vitest_1.expect)(result.error).toBe('Simulated processing failure');
        const outboxEvent = await harness.outbox.getStatus(eventId);
        (0, vitest_1.expect)(outboxEvent).toBeDefined();
        (0, vitest_1.expect)(outboxEvent.status).toBe('dead_letter');
        const updatedCase = harness.recovery.getCase(caseId);
        (0, vitest_1.expect)(updatedCase.totalOverdue).toBe(5000);
        (0, vitest_1.expect)(harness.dashboard.refreshCallCount).toBe(0);
        (0, vitest_1.expect)(harness.worker.getSuccessCount()).toBe(0);
        (0, vitest_1.expect)(harness.worker.getFailureCount()).toBe(1);
    });
    (0, vitest_1.it)('recovers from worker crash during processing', async () => {
        await harness.recovery.createCase({
            caseId,
            customerId,
            tenantId,
            totalOverdue: 5000,
            status: 'active',
            nextActionType: 'send_reminder',
            brokenPromises: 0,
            ignoredReminders: 0,
            automationMode: 'auto',
            updatedAt: new Date().toISOString(),
        });
        const eventId = await harness.outbox.publish({
            id: 'pay-crash-001',
            type: 'payment.completed',
            tenantId,
            aggregateType: 'payment',
            aggregateId: 'pay-crash-001',
            payload: { customerId, amount: 2000, tenantId, paymentMethod: 'cash' },
        });
        harness.worker.simulateCrashOnNext = true;
        const crashResult = await harness.worker.processNext();
        (0, vitest_1.expect)(crashResult.success).toBe(false);
        (0, vitest_1.expect)(crashResult.error).toBe('Simulated crash');
        const crashedEvent = await harness.outbox.getStatus(eventId);
        (0, vitest_1.expect)(crashedEvent.status).toBe('processing');
        harness.worker.simulateCrashOnNext = false;
        harness.worker.failNext = false;
        harness.outbox.setStatus(eventId, 'pending');
        const retryResult = await harness.worker.processNext();
        (0, vitest_1.expect)(retryResult).not.toBeNull();
        (0, vitest_1.expect)(retryResult.success).toBe(true);
        const recoveredEvent = await harness.outbox.getStatus(eventId);
        (0, vitest_1.expect)(recoveredEvent.status).toBe('processed');
        const updatedCase = harness.recovery.getCase(caseId);
        (0, vitest_1.expect)(updatedCase.totalOverdue).toBe(3000);
        (0, vitest_1.expect)(harness.dashboard.refreshCallCount).toBe(1);
        (0, vitest_1.expect)(harness.timeline.getEventCount()).toBe(1);
    });
});
//# sourceMappingURL=failure.test.js.map