"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const helpers_1 = require("./helpers");
const steps_1 = require("../../scenarios/steps");
const expectations_1 = require("../../scenarios/expectations");
(0, vitest_1.describe)('Scenario: Promise Lifecycle', () => {
    (0, vitest_1.it)('active promise suppresses reminders', async () => {
        const result = await (0, helpers_1.runScenario)({
            name: 'Active promise suppresses reminders',
            steps: [
                (0, steps_1.createCustomer)('Promise1'),
                (0, steps_1.createInvoice)('Promise1', 5000),
                (0, steps_1.createPromise)('Promise1', 5),
            ],
            expect: [
                (0, expectations_1.outstanding)('Promise1', 5000),
                (0, expectations_1.nextAction)('Promise1', 'wait'),
                (0, expectations_1.messagesSent)(0),
                (0, expectations_1.noErrorState)(),
            ],
        });
        (0, helpers_1.assertScenarioSuccess)(result);
    });
    (0, vitest_1.it)('fulfilled promise keeps case open but re-enables reminders', async () => {
        const result = await (0, helpers_1.runScenario)({
            name: 'Fulfilled promise re-enables reminders',
            steps: [
                (0, steps_1.createCustomer)('Promise2'),
                (0, steps_1.createInvoice)('Promise2', 5000),
                (0, steps_1.createPromise)('Promise2', 5),
                (0, steps_1.fulfillPromise)('Promise2'),
            ],
            expect: [
                (0, expectations_1.outstanding)('Promise2', 5000),
                (0, expectations_1.nextAction)('Promise2', 'reminder'),
                (0, expectations_1.messagesSent)(0),
                (0, expectations_1.noErrorState)(),
            ],
        });
        (0, helpers_1.assertScenarioSuccess)(result);
    });
    (0, vitest_1.it)('broken promise escalates to call', async () => {
        const result = await (0, helpers_1.runScenario)({
            name: 'Broken promise escalates to call',
            steps: [
                (0, steps_1.createCustomer)('Promise3'),
                (0, steps_1.createInvoice)('Promise3', 5000),
                (0, steps_1.createPromise)('Promise3', 1),
                (0, steps_1.advanceClock)(2),
            ],
            expect: [
                (0, expectations_1.outstanding)('Promise3', 5000),
                (0, expectations_1.nextAction)('Promise3', 'call'),
                (0, expectations_1.brokenPromises)('Promise3', 1),
                (0, expectations_1.timelineContains)('promise.broken'),
                (0, expectations_1.noErrorState)(),
            ],
        });
        (0, helpers_1.assertScenarioSuccess)(result);
    });
    (0, vitest_1.it)('broken promise → payment resolves case', async () => {
        const result = await (0, helpers_1.runScenario)({
            name: 'Broken promise then payment resolves',
            steps: [
                (0, steps_1.createCustomer)('Promise4'),
                (0, steps_1.createInvoice)('Promise4', 8000),
                (0, steps_1.createPromise)('Promise4', 1),
                (0, steps_1.advanceClock)(2),
                (0, steps_1.receivePayment)('Promise4', 8000),
            ],
            expect: [
                (0, expectations_1.outstanding)('Promise4', 0),
                (0, expectations_1.nextAction)('Promise4', 'closed'),
                (0, expectations_1.recoveryStatus)('Promise4', 'recovered'),
                (0, expectations_1.brokenPromises)('Promise4', 1),
                (0, expectations_1.timelineEventCount)(4),
                (0, expectations_1.noErrorState)(),
            ],
        });
        (0, helpers_1.assertScenarioSuccess)(result);
    });
    (0, vitest_1.it)('promise due today gets followed up', async () => {
        const result = await (0, helpers_1.runScenario)({
            name: 'Promise due today gets follow-up',
            steps: [
                (0, steps_1.createCustomer)('Promise5'),
                (0, steps_1.createInvoice)('Promise5', 3000),
                (0, steps_1.createPromise)('Promise5', 0),
            ],
            expect: [
                (0, expectations_1.outstanding)('Promise5', 3000),
                (0, expectations_1.nextAction)('Promise5', 'wait'),
                (0, expectations_1.noErrorState)(),
            ],
        });
        (0, helpers_1.assertScenarioSuccess)(result);
    });
});
//# sourceMappingURL=promise-lifecycle.test.js.map