import type { ScenarioExpectation } from './scenario-runner';
export declare function outstanding(customerName: string, expected: number): ScenarioExpectation;
export declare function workQueueCount(expected: number): ScenarioExpectation;
export declare function timelineEventCount(expected: number): ScenarioExpectation;
export declare function timelineContains(text: string): ScenarioExpectation;
export declare function reminderCount(customerName: string, expected: number): ScenarioExpectation;
export declare function messagesSent(expected: number): ScenarioExpectation;
export declare function recoveryStatus(customerName: string, status: string): ScenarioExpectation;
export declare function nextAction(customerName: string, action: string): ScenarioExpectation;
export declare function cashMetric(name: string, expected: number): ScenarioExpectation;
export declare function brokenPromises(customerName: string, expected: number): ScenarioExpectation;
export declare function workerEventsProcessed(expected: number): ScenarioExpectation;
export declare function dashboardRefreshed(expected: number): ScenarioExpectation;
export declare function noErrorState(): ScenarioExpectation;
//# sourceMappingURL=expectations.d.ts.map