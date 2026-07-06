"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const helpers_1 = require("./helpers");
const steps_1 = require("../../scenarios/steps");
const expectations_1 = require("../../scenarios/expectations");
(0, vitest_1.describe)('Scenario: Automatic Reminder', () => {
    (0, vitest_1.it)('fires for unpaid invoice', async () => {
        const result = await (0, helpers_1.runScenario)({
            name: 'Auto reminder fires for unpaid invoice',
            steps: [
                (0, steps_1.createCustomer)('Anita'),
                (0, steps_1.createInvoice)('Anita', 3000),
                (0, steps_1.autoReminder)('Anita'),
            ],
            expect: [
                (0, expectations_1.messagesSent)(1),
                (0, expectations_1.noErrorState)(),
            ],
        });
        (0, helpers_1.assertScenarioSuccess)(result);
    });
    (0, vitest_1.it)('increments on each reminder', async () => {
        const result = await (0, helpers_1.runScenario)({
            name: 'Auto reminder increments counter',
            steps: [
                (0, steps_1.createCustomer)('Bina'),
                (0, steps_1.createInvoice)('Bina', 4000),
                (0, steps_1.autoReminder)('Bina'),
                (0, steps_1.autoReminder)('Bina'),
            ],
            expect: [
                (0, expectations_1.messagesSent)(2),
                (0, expectations_1.reminderCount)('Bina', 2),
                (0, expectations_1.noErrorState)(),
            ],
        });
        (0, helpers_1.assertScenarioSuccess)(result);
    });
    (0, vitest_1.it)('skips recovered case', async () => {
        const result = await (0, helpers_1.runScenario)({
            name: 'Auto reminder skips paid invoice',
            steps: [
                (0, steps_1.createCustomer)('Chitra'),
                (0, steps_1.createInvoice)('Chitra', 5000),
                (0, steps_1.receivePayment)('Chitra', 5000),
                (0, steps_1.autoReminder)('Chitra'),
            ],
            expect: [
                (0, expectations_1.messagesSent)(0),
                (0, expectations_1.outstanding)('Chitra', 0),
                (0, expectations_1.recoveryStatus)('Chitra', 'recovered'),
                (0, expectations_1.noErrorState)(),
            ],
        });
        (0, helpers_1.assertScenarioSuccess)(result);
    });
    (0, vitest_1.it)('skips customer with active promise', async () => {
        const result = await (0, helpers_1.runScenario)({
            name: 'Auto reminder skips promise',
            steps: [
                (0, steps_1.createCustomer)('Divya'),
                (0, steps_1.createInvoice)('Divya', 6000),
                (0, steps_1.createPromise)('Divya', 3),
                (0, steps_1.autoReminder)('Divya'),
            ],
            expect: [
                (0, expectations_1.messagesSent)(0),
                (0, expectations_1.noErrorState)(),
            ],
        });
        (0, helpers_1.assertScenarioSuccess)(result);
    });
    (0, vitest_1.it)('reminder updates dashboard and timeline', async () => {
        const result = await (0, helpers_1.runScenario)({
            name: 'Reminder updates dashboard and timeline',
            steps: [
                (0, steps_1.createCustomer)('Ekta'),
                (0, steps_1.createInvoice)('Ekta', 7000),
                (0, steps_1.autoReminder)('Ekta'),
            ],
            expect: [
                (0, expectations_1.messagesSent)(1),
                (0, expectations_1.timelineEventCount)(2),
                (0, expectations_1.noErrorState)(),
            ],
        });
        (0, helpers_1.assertScenarioSuccess)(result);
    });
});
//# sourceMappingURL=auto-reminder.test.js.map