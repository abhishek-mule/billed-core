"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const helpers_1 = require("./helpers");
const steps_1 = require("../../scenarios/steps");
const expectations_1 = require("../../scenarios/expectations");
(0, vitest_1.describe)('Scenario: Offline Sync', () => {
    (0, vitest_1.it)('single offline invoice syncs to one recovery case', async () => {
        const result = await (0, helpers_1.runScenario)({
            name: 'Offline invoice creates one recovery case on sync',
            steps: [
                (0, steps_1.createCustomer)('Offline1'),
                (0, steps_1.createInvoice)('Offline1', 5000),
                (0, steps_1.simulateSync)(),
            ],
            expect: [
                (0, expectations_1.outstanding)('Offline1', 5000),
                (0, expectations_1.recoveryStatus)('Offline1', 'active'),
                (0, expectations_1.noErrorState)(),
            ],
        });
        (0, helpers_1.assertScenarioSuccess)(result);
    });
    (0, vitest_1.it)('multiple offline invoices sync to correct totals', async () => {
        const result = await (0, helpers_1.runScenario)({
            name: 'Multiple offline invoices sync correctly',
            steps: [
                (0, steps_1.createCustomer)('Offline2'),
                (0, steps_1.createInvoice)('Offline2', 3000),
                (0, steps_1.createInvoice)('Offline2', 4000),
                (0, steps_1.simulateSync)(),
            ],
            expect: [
                (0, expectations_1.outstanding)('Offline2', 7000),
                (0, expectations_1.noErrorState)(),
            ],
        });
        (0, helpers_1.assertScenarioSuccess)(result);
    });
    (0, vitest_1.it)('offline payment syncs and reduces outstanding', async () => {
        const result = await (0, helpers_1.runScenario)({
            name: 'Offline payment syncs and updates',
            steps: [
                (0, steps_1.createCustomer)('Offline3'),
                (0, steps_1.createInvoice)('Offline3', 10000),
                (0, steps_1.simulateSync)(),
                (0, steps_1.receivePayment)('Offline3', 4000),
                (0, steps_1.simulateSync)(),
            ],
            expect: [
                (0, expectations_1.outstanding)('Offline3', 6000),
                (0, expectations_1.cashMetric)('cash_received', 4000),
                (0, expectations_1.noErrorState)(),
            ],
        });
        (0, helpers_1.assertScenarioSuccess)(result);
    });
    (0, vitest_1.it)('worker restart recovers events', async () => {
        const result = await (0, helpers_1.runScenario)({
            name: 'Worker restart recovers pending events',
            steps: [
                (0, steps_1.createCustomer)('Restart1'),
                (0, steps_1.createInvoice)('Restart1', 5000),
                (0, steps_1.workerRestart)(),
            ],
            expect: [
                (0, expectations_1.outstanding)('Restart1', 5000),
                (0, expectations_1.noErrorState)(),
            ],
        });
        (0, helpers_1.assertScenarioSuccess)(result);
    });
    (0, vitest_1.it)('full offline → sync → worker → dashboard cycle', async () => {
        const result = await (0, helpers_1.runScenario)({
            name: 'Full offline cycle',
            steps: [
                (0, steps_1.createCustomer)('FullCycle'),
                (0, steps_1.createInvoice)('FullCycle', 8000),
                (0, steps_1.simulateSync)(),
                (0, steps_1.receivePayment)('FullCycle', 3000),
                (0, steps_1.simulateSync)(),
                (0, steps_1.workerRestart)(),
            ],
            expect: [
                (0, expectations_1.outstanding)('FullCycle', 5000),
                (0, expectations_1.cashMetric)('cash_received', 3000),
                (0, expectations_1.nextAction)('FullCycle', 'review'),
                (0, expectations_1.noErrorState)(),
            ],
        });
        (0, helpers_1.assertScenarioSuccess)(result);
    });
});
//# sourceMappingURL=offline-sync.test.js.map