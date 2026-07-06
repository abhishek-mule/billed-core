"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScenarioRunner = void 0;
exports.step = step;
exports.expect = expect;
const test_harness_1 = require("../transports/test-harness");
let nextId = 1;
class ScenarioRunner {
    constructor() {
        this.results = [];
    }
    async run(scenario) {
        const start = performance.now();
        const harness = (0, test_harness_1.createTestHarness)();
        const stepResults = [];
        const expectResults = [];
        try {
            for (const step of scenario.steps) {
                try {
                    await step.run(harness);
                    stepResults.push({ label: step.label, passed: true });
                }
                catch (err) {
                    const message = err instanceof Error ? err.message : String(err);
                    stepResults.push({ label: step.label, passed: false, error: message });
                    break;
                }
            }
            for (const ex of scenario.expect) {
                try {
                    await ex.check(harness);
                    expectResults.push({ label: ex.label, passed: true });
                }
                catch (err) {
                    const message = err instanceof Error ? err.message : String(err);
                    expectResults.push({ label: ex.label, passed: false, error: message });
                }
            }
        }
        finally {
            harness.reset();
        }
        const durationMs = performance.now() - start;
        const success = stepResults.every(r => r.passed) && expectResults.every(r => r.passed);
        const result = { name: scenario.name, success, stepResults, expectResults, durationMs };
        this.results.push(result);
        return result;
    }
    runAll(scenarios) {
        return Promise.all(scenarios.map(s => this.run(s)));
    }
    getResults() {
        return this.results;
    }
    static getNextId(prefix = 'id') {
        return `${prefix}-${nextId++}`;
    }
}
exports.ScenarioRunner = ScenarioRunner;
function step(label, run) {
    return { label, run };
}
function expect(label, check) {
    return { label, check };
}
//# sourceMappingURL=scenario-runner.js.map