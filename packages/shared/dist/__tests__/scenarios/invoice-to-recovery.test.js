"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const helpers_1 = require("./helpers");
const steps_1 = require("../../scenarios/steps");
const expectations_1 = require("../../scenarios/expectations");
(0, vitest_1.describe)('Scenario: Invoice → Recovery', () => {
    (0, vitest_1.it)('creates invoice → recovery case → today work', async () => {
        const result = await (0, helpers_1.runScenario)({
            name: 'Invoice creates recovery case and today work',
            steps: [
                (0, steps_1.createCustomer)('Raj'),
                (0, steps_1.createInvoice)('Raj', 5000),
            ],
            expect: [
                (0, expectations_1.outstanding)('Raj', 5000),
                (0, expectations_1.recoveryStatus)('Raj', 'active'),
                (0, expectations_1.nextAction)('Raj', 'reminder'),
                (0, expectations_1.cashMetric)('outstanding', 5000),
                (0, expectations_1.dashboardRefreshed)(1),
                (0, expectations_1.workerEventsProcessed)(1),
                (0, expectations_1.noErrorState)(),
            ],
        });
        (0, helpers_1.assertScenarioSuccess)(result);
    });
    (0, vitest_1.it)('full payment clears recovery case and updates dashboard', async () => {
        const result = await (0, helpers_1.runScenario)({
            name: 'Full payment clears debt',
            steps: [
                (0, steps_1.createCustomer)('Priya'),
                (0, steps_1.createInvoice)('Priya', 3000),
                (0, steps_1.receivePayment)('Priya', 3000),
            ],
            expect: [
                (0, expectations_1.outstanding)('Priya', 0),
                (0, expectations_1.recoveryStatus)('Priya', 'recovered'),
                (0, expectations_1.cashMetric)('cash_received', 3000),
                (0, expectations_1.timelineEventCount)(2),
                (0, expectations_1.timelineContains)('payment.completed'),
                (0, expectations_1.noErrorState)(),
            ],
        });
        (0, helpers_1.assertScenarioSuccess)(result);
    });
    (0, vitest_1.it)('partial payment reduces outstanding without closing case', async () => {
        const result = await (0, helpers_1.runScenario)({
            name: 'Partial payment reduces debt',
            steps: [
                (0, steps_1.createCustomer)('Amit'),
                (0, steps_1.createInvoice)('Amit', 10000),
                (0, steps_1.receivePayment)('Amit', 4000),
            ],
            expect: [
                (0, expectations_1.outstanding)('Amit', 6000),
                (0, expectations_1.recoveryStatus)('Amit', 'active'),
                (0, expectations_1.nextAction)('Amit', 'review'),
                (0, expectations_1.cashMetric)('cash_received', 4000),
                (0, expectations_1.cashMetric)('outstanding', 10000),
                (0, expectations_1.timelineEventCount)(2),
                (0, expectations_1.noErrorState)(),
            ],
        });
        (0, helpers_1.assertScenarioSuccess)(result);
    });
    (0, vitest_1.it)('invoice + manual reminder sends message and updates timeline', async () => {
        const result = await (0, helpers_1.runScenario)({
            name: 'Manual reminder sends message',
            steps: [
                (0, steps_1.createCustomer)('Sunita'),
                (0, steps_1.createInvoice)('Sunita', 2000),
                (0, steps_1.sendManualReminder)('Sunita'),
            ],
            expect: [
                (0, expectations_1.outstanding)('Sunita', 2000),
                (0, expectations_1.messagesSent)(1),
                (0, expectations_1.timelineEventCount)(2),
                (0, expectations_1.timelineContains)('reminder'),
                (0, expectations_1.noErrorState)(),
            ],
        });
        (0, helpers_1.assertScenarioSuccess)(result);
    });
    (0, vitest_1.it)('multiple steps — invoice, payment, reminder — all project consistently', async () => {
        const result = await (0, helpers_1.runScenario)({
            name: 'Multi-step consistency',
            steps: [
                (0, steps_1.createCustomer)('Vikram'),
                (0, steps_1.createInvoice)('Vikram', 8000),
                (0, steps_1.receivePayment)('Vikram', 3000),
                (0, steps_1.sendManualReminder)('Vikram'),
            ],
            expect: [
                (0, expectations_1.outstanding)('Vikram', 5000),
                (0, expectations_1.recoveryStatus)('Vikram', 'active'),
                (0, expectations_1.cashMetric)('cash_received', 3000),
                (0, expectations_1.cashMetric)('outstanding', 8000),
                (0, expectations_1.timelineEventCount)(3),
                (0, expectations_1.noErrorState)(),
            ],
        });
        (0, helpers_1.assertScenarioSuccess)(result);
    });
});
//# sourceMappingURL=invoice-to-recovery.test.js.map