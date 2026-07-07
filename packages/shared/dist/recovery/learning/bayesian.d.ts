export interface BetaDistribution {
    alpha: number;
    beta: number;
}
export declare function createBetaPrior(alpha: number, beta: number): BetaDistribution;
export declare function updateBelief(prior: BetaDistribution, successes: number, trials: number): BetaDistribution;
export declare function posteriorMean(dist: BetaDistribution): number;
export declare function posteriorVariance(dist: BetaDistribution): number;
export declare function combineHierarchicalPriors(customerPrior: BetaDistribution, merchantPrior: BetaDistribution | null, industryPrior: BetaDistribution | null, globalPrior: BetaDistribution, customerWeight: number): BetaDistribution;
export declare function sampleSizeToWeight(sampleCount: number, inflectionPoint?: number): number;
//# sourceMappingURL=bayesian.d.ts.map