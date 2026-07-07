export interface BetaDistribution {
  alpha: number
  beta: number
}

export function createBetaPrior(alpha: number, beta: number): BetaDistribution {
  return { alpha, beta }
}

export function updateBelief(prior: BetaDistribution, successes: number, trials: number): BetaDistribution {
  return {
    alpha: prior.alpha + successes,
    beta: prior.beta + (trials - successes),
  }
}

export function posteriorMean(dist: BetaDistribution): number {
  const total = dist.alpha + dist.beta
  return total > 0 ? dist.alpha / total : 0
}

export function posteriorVariance(dist: BetaDistribution): number {
  const total = dist.alpha + dist.beta
  return total > 0
    ? (dist.alpha * dist.beta) / (total * total * (total + 1))
    : 0
}

export function combineHierarchicalPriors(
  customerPrior: BetaDistribution,
  merchantPrior: BetaDistribution | null,
  industryPrior: BetaDistribution | null,
  globalPrior: BetaDistribution,
  customerWeight: number,
): BetaDistribution {
  let alpha = customerPrior.alpha * customerWeight
  let beta = customerPrior.beta * customerWeight
  const remainingWeight = 1 - customerWeight

  if (merchantPrior) {
    alpha += merchantPrior.alpha * remainingWeight * 0.5
    beta += merchantPrior.beta * remainingWeight * 0.5
  } else {
    alpha += industryPrior
      ? industryPrior.alpha * remainingWeight * 0.5
      : globalPrior.alpha * remainingWeight * 0.5
    beta += industryPrior
      ? industryPrior.beta * remainingWeight * 0.5
      : globalPrior.beta * remainingWeight * 0.5
  }

  alpha += globalPrior.alpha * remainingWeight * 0.5
  beta += globalPrior.beta * remainingWeight * 0.5

  return { alpha, beta }
}

export function sampleSizeToWeight(sampleCount: number, inflectionPoint: number = 15): number {
  return 1 - Math.exp(-sampleCount / inflectionPoint)
}
