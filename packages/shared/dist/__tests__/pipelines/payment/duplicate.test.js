"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const test_harness_1 = require("../../../transports/test-harness");
(0, vitest_1.describe)('Payment Pipeline — duplicate', () => {
    let harness;
    const customerId = 'cust-002';
    const tenantId = 'tenant-test';
    const caseId = `case-${customerId}`;
    (0, vitest_1.beforeEach)(() => {
        harness = (0, test_harness_1.createTestHarness)();
    });
    (0, vitest_1.it)('ignores duplicate payment.completed events with same id', async () => {
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
        const eventId = 'pay-dup-001';
        await harness.outbox.publish({
            id: eventId,
            type: 'payment.completed',
            tenantId,
            aggregateType: 'payment',
            aggregateId: eventId,
            payload: { customerId, amount: 2000, tenantId, paymentMethod: 'cash' },
        });
        await harness.outbox.publish({
            id: eventId,
            type: 'payment.completed',
            tenantId,
            aggregateType: 'payment',
            aggregateId: eventId,
            payload: { customerId, amount: 2000, tenantId, paymentMethod: 'cash' },
        });
        const results = await harness.worker.processAll();
        const successResults = results.filter(r => r.success);
        (0, vitest_1.expect)(successResults).toHaveLength(1);
        const pending = harness.outbox.getPending();
        (0, vitest_1.expect)(pending).toHaveLength(0);
        const updatedCase = harness.recovery.getCase(caseId);
        (0, vitest_1.expect)(updatedCase.totalOverdue).toBe(3000);
        (0, vitest_1.expect)(harness.dashboard.refreshCallCount).toBe(1);
        (0, vitest_1.expect)(harness.pipelineRegistry['payment.completed'].idempotent).toBe(true);
    });
    (0, vitest_1.it)('handles same payload delivered twice from different outbox ids', async () => {
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
        await harness.outbox.publish({
            id: 'pay-dup-a',
            type: 'payment.completed',
            tenantId,
            aggregateType: 'payment',
            aggregateId: 'pay-dup-a',
            payload: { customerId, amount: 2000, tenantId, paymentMethod: 'cash' },
        });
        await harness.outbox.publish({
            id: 'pay-dup-b',
            type: 'payment.completed',
            tenantId,
            aggregateType: 'payment',
            aggregateId: 'pay-dup-b',
            payload: { customerId, amount: 2000, tenantId, paymentMethod: 'cash' },
        });
        const results = await harness.worker.processAll();
        const successResults = results.filter(r => r.success);
        (0, vitest_1.expect)(successResults).toHaveLength(2);
        const updatedCase = harness.recovery.getCase(caseId);
        (0, vitest_1.expect)(updatedCase.totalOverdue).toBe(1000);
        (0, vitest_1.expect)(harness.dashboard.getMetric('cash_received').value).toBe(4000);
        (0, vitest_1.expect)(harness.dashboard.refreshCallCount).toBe(2);
        (0, vitest_1.expect)(harness.timeline.getEventCount()).toBe(2);
    });
});
//# sourceMappingURL=duplicate.test.js.map