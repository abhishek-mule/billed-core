"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runScenario = runScenario;
exports.assertScenarioSuccess = assertScenarioSuccess;
const scenario_runner_1 = require("../../scenarios/scenario-runner");
function runScenario(scenario) {
    const runner = new scenario_runner_1.ScenarioRunner();
    return runner.run(scenario);
}
function assertScenarioSuccess(result) {
    const failedSteps = result.stepResults.filter(r => !r.passed);
    const failedExpect = result.expectResults.filter(r => !r.passed);
    if (failedSteps.length > 0 || failedExpect.length > 0) {
        const lines = [`Scenario "${result.name}" FAILED (${result.durationMs.toFixed(0)}ms)`];
        for (const s of failedSteps) {
            lines.push(`  Step: ${s.label}`);
            lines.push(`    ${s.error}`);
        }
        for (const e of failedExpect) {
            lines.push(`  Expect: ${e.label}`);
            lines.push(`    ${e.error}`);
        }
        throw new Error(lines.join('\n'));
    }
}
//# sourceMappingURL=helpers.js.map