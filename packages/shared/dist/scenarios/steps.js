"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCustomer = createCustomer;
exports.createInvoice = createInvoice;
exports.receivePayment = receivePayment;
exports.advanceClock = advanceClock;
exports.sendManualReminder = sendManualReminder;
exports.autoReminder = autoReminder;
exports.createPromise = createPromise;
exports.fulfillPromise = fulfillPromise;
exports.simulateSync = simulateSync;
exports.workerRestart = workerRestart;
const scenario_runner_1 = require("./scenario-runner");
function createCustomer(name) {
    const customerId = `cust-${name.replace(/\s/g, '-').toLowerCase()}`;
    return {
        label: `Create customer "${name}"`,
        run: async (h) => {
            const caseId = `case-${customerId}`;
            await h.recovery.createCase({
                caseId,
                customerId,
                tenantId: 'test',
                totalOverdue: 0,
                status: 'active',
                nextActionType: 'none',
                brokenPromises: 0,
                ignoredReminders: 0,
                automationMode: 'auto',
                updatedAt: new Date().toISOString(),
            });
        },
    };
}
function createInvoice(customerName, amount) {
    const customerId = `cust-${customerName.replace(/\s/g, '-').toLowerCase()}`;
    const invoiceId = `inv-${scenario_runner_1.ScenarioRunner.getNextId()}`;
    return {
        label: `Create invoice ₹${amount} for "${customerName}"`,
        run: async (h) => {
            const caseId = `case-${customerId}`;
            await h.outbox.publish({
                id: invoiceId,
                type: 'invoice.created',
                tenantId: 'test',
                aggregateType: 'invoice',
                aggregateId: invoiceId,
                payload: { customerId, amount, tenantId: 'test', invoiceId },
            });
            await h.worker.processAll();
        },
    };
}
function receivePayment(customerName, amount) {
    const customerId = `cust-${customerName.replace(/\s/g, '-').toLowerCase()}`;
    const paymentId = `pay-${scenario_runner_1.ScenarioRunner.getNextId()}`;
    return {
        label: `Receive payment ₹${amount} from "${customerName}"`,
        run: async (h) => {
            await h.outbox.publish({
                id: paymentId,
                type: 'payment.completed',
                tenantId: 'test',
                aggregateType: 'payment',
                aggregateId: paymentId,
                payload: { customerId, amount, tenantId: 'test', paymentMethod: 'cash' },
            });
            await h.worker.processAll();
        },
    };
}
function advanceClock(days) {
    return {
        label: `Advance clock by ${days} day(s)`,
        run: async (h) => {
            h.clock.advance(days * 24 * 60 * 60 * 1000);
            await h.outbox.publish({
                id: `tick-${scenario_runner_1.ScenarioRunner.getNextId()}`,
                type: 'scheduler.tick',
                tenantId: 'test',
                aggregateType: 'scheduler',
                aggregateId: 'scheduler',
                payload: {},
            });
            await h.worker.processAll();
        },
    };
}
function sendManualReminder(customerName) {
    const customerId = `cust-${customerName.replace(/\s/g, '-').toLowerCase()}`;
    const caseId = `case-${customerId}`;
    return {
        label: `Send manual reminder to "${customerName}"`,
        run: async (h) => {
            await h.outbox.publish({
                id: `remind-${scenario_runner_1.ScenarioRunner.getNextId()}`,
                type: 'reminder.requested',
                tenantId: 'test',
                aggregateType: 'reminder',
                aggregateId: caseId,
                payload: { customerId, tenantId: 'test', caseId, trigger: 'manual', override: true },
            });
            await h.worker.processAll();
        },
    };
}
function autoReminder(customerName) {
    const customerId = `cust-${customerName.replace(/\s/g, '-').toLowerCase()}`;
    const caseId = `case-${customerId}`;
    return {
        label: `Automatic reminder fires for "${customerName}"`,
        run: async (h) => {
            const case_ = h.recovery.getCase(caseId);
            if (!case_ || case_.totalOverdue <= 0 || case_.nextActionType === 'wait' || case_.status !== 'active') {
                return;
            }
            const caseUpdated = new Date(case_.updatedAt);
            const now = h.clock.now();
            const sameDay = caseUpdated.toDateString() === now.toDateString();
            if (sameDay) {
                return;
            }
            await h.outbox.publish({
                id: `remind-auto-${scenario_runner_1.ScenarioRunner.getNextId()}`,
                type: 'reminder.requested',
                tenantId: 'test',
                aggregateType: 'reminder',
                aggregateId: caseId,
                payload: { customerId, tenantId: 'test', caseId, trigger: 'automatic', override: false },
            });
            await h.worker.processAll();
        },
    };
}
function createPromise(customerName, daysFromNow) {
    const customerId = `cust-${customerName.replace(/\s/g, '-').toLowerCase()}`;
    const caseId = `case-${customerId}`;
    return {
        label: `Create promise due in ${daysFromNow} day(s) for "${customerName}"`,
        run: async (h) => {
            const promiseDate = new Date(h.clock.now().getTime() + daysFromNow * 24 * 60 * 60 * 1000).toISOString();
            await h.outbox.publish({
                id: `promise-${scenario_runner_1.ScenarioRunner.getNextId()}`,
                type: 'promise.created',
                tenantId: 'test',
                aggregateType: 'promise',
                aggregateId: caseId,
                payload: { customerId, tenantId: 'test', promiseDate, caseId },
            });
            await h.worker.processAll();
        },
    };
}
function fulfillPromise(customerName) {
    const customerId = `cust-${customerName.replace(/\s/g, '-').toLowerCase()}`;
    const caseId = `case-${customerId}`;
    return {
        label: `Fulfill promise for "${customerName}"`,
        run: async (h) => {
            await h.outbox.publish({
                id: `promise-fulfill-${scenario_runner_1.ScenarioRunner.getNextId()}`,
                type: 'promise.fulfilled',
                tenantId: 'test',
                aggregateType: 'promise',
                aggregateId: caseId,
                payload: { customerId, tenantId: 'test', caseId },
            });
            await h.worker.processAll();
        },
    };
}
function simulateSync() {
    return {
        label: 'Simulate sync',
        run: async (h) => {
            await h.outbox.publish({
                id: `sync-${scenario_runner_1.ScenarioRunner.getNextId()}`,
                type: 'sync.completed',
                tenantId: 'test',
                aggregateType: 'sync',
                aggregateId: 'sync-status',
                payload: { status: 'synced' },
            });
            await h.outbox.publish({
                id: `sync-outbox-${scenario_runner_1.ScenarioRunner.getNextId()}`,
                type: 'outbox.event.created',
                tenantId: 'test',
                aggregateType: 'outbox',
                aggregateId: 'outbox-status',
                payload: {},
            });
            await h.worker.processAll();
        },
    };
}
function workerRestart() {
    return {
        label: 'Simulate worker restart',
        run: async (h) => {
            h.worker.clear();
            await h.worker.processAll();
        },
    };
}
//# sourceMappingURL=steps.js.map