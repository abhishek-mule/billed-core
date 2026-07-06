import type { ScenarioStep } from './scenario-runner';
export declare function createCustomer(name: string): ScenarioStep;
export declare function createInvoice(customerName: string, amount: number): ScenarioStep;
export declare function receivePayment(customerName: string, amount: number): ScenarioStep;
export declare function advanceClock(days: number): ScenarioStep;
export declare function sendManualReminder(customerName: string): ScenarioStep;
export declare function autoReminder(customerName: string): ScenarioStep;
export declare function createPromise(customerName: string, daysFromNow: number): ScenarioStep;
export declare function fulfillPromise(customerName: string): ScenarioStep;
export declare function simulateSync(): ScenarioStep;
export declare function workerRestart(): ScenarioStep;
//# sourceMappingURL=steps.d.ts.map