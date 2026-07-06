"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const test_harness_1 = require("../../../transports/test-harness");
(0, vitest_1.describe)('Payment Pipeline — success', () => {
    let harness;
    const customerId = 'cust-001';
    const tenantId = 'tenant-test';
    const caseId = `case-${customerId}`;
    (0, vitest_1.beforeEach)(() => {
        harness = (0, test_harness_1.createTestHarness)();
    });
    (0, vitest_1.it)('processes payment.completed end-to-end', async () => {
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
            id: 'pay-001',
            type: 'payment.completed',
            tenantId,
            aggregateType: 'payment',
            aggregateId: 'pay-001',
            payload: { customerId, amount: 2000, tenantId, paymentMethod: 'cash' },
        });
        const result = await harness.worker.processNext();
        (0, vitest_1.expect)(result).not.toBeNull();
        (0, vitest_1.expect)(result.success).toBe(true);
        (0, vitest_1.expect)(result.outboxEventId).toBe(eventId);
        (0, vitest_1.expect)(result.pipelineId).toBe('payment.completed');
        const updatedCase = harness.recovery.getCase(caseId);
        (0, vitest_1.expect)(updatedCase).toBeDefined();
        (0, vitest_1.expect)(updatedCase.totalOverdue).toBe(3000);
        const cashMetric = harness.dashboard.getMetric('cash_received');
        (0, vitest_1.expect)(cashMetric).toBeDefined();
        (0, vitest_1.expect)(cashMetric.value).toBe(2000);
        (0, vitest_1.expect)(harness.dashboard.refreshCallCount).toBe(1);
        const timelineEvents = harness.timeline.getEventsForCustomer(customerId);
        (0, vitest_1.expect)(timelineEvents).toHaveLength(1);
        (0, vitest_1.expect)(timelineEvents[0].type).toBe('payment.completed');
        const outboxEvent = await harness.outbox.getStatus(eventId);
        (0, vitest_1.expect)(outboxEvent).toBeDefined();
        (0, vitest_1.expect)(outboxEvent.status).toBe('processed');
        const processed = harness.worker.processed;
        (0, vitest_1.expect)(processed).toHaveLength(1);
        (0, vitest_1.expect)(processed[0].success).toBe(true);
        harness.expectPipeline('payment.completed')
            .toProduce('outbox')
            .toBeConsumedBy('worker')
            .toUpdate('recovery')
            .toUpdate('invoice')
            .toProject('dashboard')
            .verify();
    });
});
//# sourceMappingURL=success.test.js.map