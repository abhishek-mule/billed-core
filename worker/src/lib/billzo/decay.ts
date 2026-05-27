import { DECAY_HALF_LIVES } from '@billzo/shared'

export function decayedEMA(
  oldValue: number,
  newValue: number,
  deltaDays: number,
  halfLife: number,
): number {
  if (oldValue === 0) return newValue
  if (deltaDays <= 0) deltaDays = 0
  const factor = Math.exp(-deltaDays / halfLife)
  return oldValue * factor + newValue * (1 - factor)
}

export function computeConfidence(
  observationCount: number,
  saturationPoint = 20,
): number {
  return 1 - Math.exp(-observationCount / saturationPoint)
}

export function getHalfLife(key: keyof typeof DECAY_HALF_LIVES): number {
  return DECAY_HALF_LIVES[key]
}

export function daysBetween(earlier: Date, later: Date): number {
  return (later.getTime() - earlier.getTime()) / (1000 * 60 * 60 * 24)
}
