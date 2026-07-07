export function computeEMA(values: number[], alpha: number = 0.3): number {
  if (values.length === 0) return 0
  let ema = values[0]
  for (let i = 1; i < values.length; i++) {
    ema = alpha * values[i] + (1 - alpha) * ema
  }
  return ema
}

export function computeEMASeries(values: number[], alpha: number = 0.3): number[] {
  if (values.length === 0) return []
  const series: number[] = [values[0]]
  for (let i = 1; i < values.length; i++) {
    series.push(alpha * values[i] + (1 - alpha) * series[i - 1])
  }
  return series
}

export function computeDecayedCount(
  eventTimestamps: number[],
  halfLifeDays: number = 30,
): number {
  if (eventTimestamps.length === 0) return 0
  const now = Date.now()
  const halfLifeMs = halfLifeDays * 24 * 3600 * 1000
  return eventTimestamps.reduce((sum, ts) => {
    const age = now - ts
    return sum + Math.pow(0.5, age / halfLifeMs)
  }, 0)
}
