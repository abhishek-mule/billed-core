import type { DecisionEngine, DecisionInput, DecisionOutput } from './decision-engine';
export declare class FakeDecisionEngine implements DecisionEngine {
    readonly name = "fake";
    evaluate(input: DecisionInput): Promise<DecisionOutput>;
    clear(): void;
}
//# sourceMappingURL=fake-decision-engine.d.ts.map