import type { SystemTestHarness } from '../transports/test-harness';
export type StepAction = (harness: SystemTestHarness) => Promise<void>;
export interface ScenarioStep {
    label: string;
    run: StepAction;
}
export type ExpectAction = (harness: SystemTestHarness) => Promise<void>;
export interface ScenarioExpectation {
    label: string;
    check: ExpectAction;
}
export interface ScenarioDefinition {
    name: string;
    description?: string;
    steps: ScenarioStep[];
    expect: ScenarioExpectation[];
}
export interface ScenarioResult {
    name: string;
    success: boolean;
    stepResults: Array<{
        label: string;
        passed: boolean;
        error?: string;
    }>;
    expectResults: Array<{
        label: string;
        passed: boolean;
        error?: string;
    }>;
    durationMs: number;
}
export declare class ScenarioRunner {
    private results;
    run(scenario: ScenarioDefinition): Promise<ScenarioResult>;
    runAll(scenarios: ScenarioDefinition[]): Promise<ScenarioResult[]>;
    getResults(): ScenarioResult[];
    static getNextId(prefix?: string): string;
}
export declare function step(label: string, run: StepAction): ScenarioStep;
export declare function expect(label: string, check: ExpectAction): ScenarioExpectation;
//# sourceMappingURL=scenario-runner.d.ts.map