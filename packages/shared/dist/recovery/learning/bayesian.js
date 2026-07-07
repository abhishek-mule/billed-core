"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createBetaPrior = createBetaPrior;
exports.updateBelief = updateBelief;
exports.posteriorMean = posteriorMean;
exports.posteriorVariance = posteriorVariance;
exports.combineHierarchicalPriors = combineHierarchicalPriors;
exports.sampleSizeToWeight = sampleSizeToWeight;
function createBetaPrior(alpha, beta) {
    return { alpha, beta };
}
function updateBelief(prior, successes, trials) {
    return {
        alpha: prior.alpha + successes,
        beta: prior.beta + (trials - successes),
    };
}
function posteriorMean(dist) {
    const total = dist.alpha + dist.beta;
    return total > 0 ? dist.alpha / total : 0;
}
function posteriorVariance(dist) {
    const total = dist.alpha + dist.beta;
    return total > 0
        ? (dist.alpha * dist.beta) / (total * total * (total + 1))
        : 0;
}
function combineHierarchicalPriors(customerPrior, merchantPrior, industryPrior, globalPrior, customerWeight) {
    let alpha = customerPrior.alpha * customerWeight;
    let beta = customerPrior.beta * customerWeight;
    const remainingWeight = 1 - customerWeight;
    if (merchantPrior) {
        alpha += merchantPrior.alpha * remainingWeight * 0.5;
        beta += merchantPrior.beta * remainingWeight * 0.5;
    }
    else {
        alpha += industryPrior
            ? industryPrior.alpha * remainingWeight * 0.5
            : globalPrior.alpha * remainingWeight * 0.5;
        beta += industryPrior
            ? industryPrior.beta * remainingWeight * 0.5
            : globalPrior.beta * remainingWeight * 0.5;
    }
    alpha += globalPrior.alpha * remainingWeight * 0.5;
    beta += globalPrior.beta * remainingWeight * 0.5;
    return { alpha, beta };
}
function sampleSizeToWeight(sampleCount, inflectionPoint = 15) {
    return 1 - Math.exp(-sampleCount / inflectionPoint);
}
//# sourceMappingURL=bayesian.js.map