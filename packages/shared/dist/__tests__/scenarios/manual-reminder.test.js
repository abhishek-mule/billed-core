"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const helpers_1 = require("./helpers");
const steps_1 = require("../../scenarios/steps");
const expectations_1 = require("../../scenarios/expectations");
(0, vitest_1.describe)('Scenario: Manual Reminder', () => {
    (0, vitest_1.it)('sends exactly one reminder with override=true', async () => {
        const result = await (0, helpers_1.runScenario)({
            name: 'Single manual reminder sent',
            steps: [
                (0, steps_1.createCustomer)('Deepa'),
                (0, steps_1.createInvoice)('Deepa', 4000),
                (0, steps_1.sendManualReminder)('Deepa'),
            ],
            expect: [
                (0, expectations_1.messagesSent)(1),
                (0, expectations_1.timelineEventCount)(2),
                (0, expectations_1.timelineContains)('reminder'),
                (0, expectations_1.reminderCount)('Deepa', 1),
                (0, expectations_1.nextAction)('Deepa', 'reminder'),
                (0, expectations_1.noErrorState)(),
            ],
        });
        (0, helpers_1.assertScenarioSuccess)(result);
    });
    (0, vitest_1.it)('manual reminder fires even after automatic reminders were sent', async () => {
        const result = await (0, helpers_1.runScenario)({
            name: 'Manual override after auto reminders',
            steps: [
                (0, steps_1.createCustomer)('Ravi'),
                (0, steps_1.createInvoice)('Ravi', 6000),
                (0, steps_1.sendManualReminder)('Ravi'),
                (0, steps_1.sendManualReminder)('Ravi'),
            ],
            expect: [
                (0, expectations_1.messagesSent)(2),
                (0, expectations_1.timelineEventCount)(3),
                (0, expectations_1.reminderCount)('Ravi', 2),
                (0, expectations_1.noErrorState)(),
            ],
        });
        (0, helpers_1.assertScenarioSuccess)(result);
    });
    (0, vitest_1.it)('reminder on fully paid customer is skipped', async () => {
        const result = await (0, helpers_1.runScenario)({
            name: 'Reminder on paid customer is no-op',
            steps: [
                (0, steps_1.createCustomer)('Empty'),
                (0, steps_1.createInvoice)('Empty', 5000),
                (0, steps_1.receivePayment)('Empty', 5000),
                (0, steps_1.sendManualReminder)('Empty'),
            ],
            expect: [
                (0, expectations_1.outstanding)('Empty', 0),
                (0, expectations_1.recoveryStatus)('Empty', 'recovered'),
                (0, expectations_1.messagesSent)(0),
                (0, expectations_1.noErrorState)(),
            ],
        });
        (0, helpers_1.assertScenarioSuccess)(result);
    });
    (0, vitest_1.it)('reminder increments counter and appears in timeline', async () => {
        const result = await (0, helpers_1.runScenario)({
            name: 'Reminder counter and timeline',
            steps: [
                (0, steps_1.createCustomer)('Neha'),
                (0, steps_1.createInvoice)('Neha', 2000),
                (0, steps_1.sendManualReminder)('Neha'),
            ],
            expect: [
                (0, expectations_1.reminderCount)('Neha', 1),
                (0, expectations_1.timelineEventCount)(2),
                (0, expectations_1.timelineContains)('reminder'),
            ],
        });
        (0, helpers_1.assertScenarioSuccess)(result);
    });
});
//# sourceMappingURL=manual-reminder.test.js.map