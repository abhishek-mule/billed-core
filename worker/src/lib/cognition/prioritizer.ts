import type { SituationCandidate } from './types'
import { MAX_ACTIVE_SITUATIONS } from './types'

export function prioritize(candidates: SituationCandidate[]): SituationCandidate[] {
  const now = new Date()
  now.setSeconds(0, 0)

  return candidates
    .map(c => ({
      ...c,
      priorityScore: applyTimingPenalty(c.priorityScore, c, now),
    }))
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, MAX_ACTIVE_SITUATIONS)
}

function applyTimingPenalty(score: number, candidate: SituationCandidate, now: Date): number {
  const seed = candidate.narrativeSeed
  if (!seed.windowInfo) return score

  const windowStart = new Date(seed.windowInfo.bestStart)
  const windowEnd = new Date(seed.windowInfo.bestEnd)

  // If outside decision window, apply penalty
  if (now < windowStart) {
    // Too early — slight penalty (will boost as window approaches)
    const hoursUntilWindow = (windowStart.getTime() - now.getTime()) / (1000 * 60 * 60)
    return score - Math.min(hoursUntilWindow * 2, 20)
  }

  if (now > windowEnd) {
    // Window passed — heavier penalty (opportunity decaying)
    const hoursSinceWindowEnd = (now.getTime() - windowEnd.getTime()) / (1000 * 60 * 60)
    return score - Math.min(hoursSinceWindowEnd * 5, 30)
  }

  // Within window — boost (most actionable now)
  const windowDuration = (windowEnd.getTime() - windowStart.getTime()) / (1000 * 60 * 60)
  const hoursLeft = (windowEnd.getTime() - now.getTime()) / (1000 * 60 * 60)
  const urgencyFactor = windowDuration > 0 ? 1 - (hoursLeft / windowDuration) : 0
  return score + urgencyFactor * 15
}
