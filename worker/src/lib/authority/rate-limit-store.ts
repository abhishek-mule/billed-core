import type { SovereigntyRule } from './schemas'
import type { RateLimitStore } from './core'

interface CounterWindow {
  readonly windowStart: number
  readonly count: number
}

/**
 * In-memory fallback rate limiter.
 * Used when Redis is unavailable — approximate, not durable.
 * Resets on process restart.
 */
export class LocalFallbackRateLimitStore implements RateLimitStore {
  private readonly counters = new Map<string, CounterWindow>()

  async getCurrentCounts(
    _rule: SovereigntyRule,
    _tenantId: string,
  ): Promise<{ perSecond?: number; perMinute?: number; perHour?: number; perTenantPerDay?: number }> {
    return {}
  }

  track(key: string, windowMs: number, _max: number): { allowed: boolean; current: number } {
    const now = Date.now()
    const entry = this.counters.get(key)

    if (!entry || now - entry.windowStart > windowMs) {
      this.counters.set(key, { windowStart: now, count: 1 })
      return { allowed: true, current: 1 }
    }

    const next: CounterWindow = { windowStart: entry.windowStart, count: entry.count + 1 }
    this.counters.set(key, next)

    return { allowed: next.count <= _max, current: next.count }
  }
}

/**
 * Degrade-able rate limit store factory.
 *
 * If the primary store is unavailable, returns a LocalFallbackRateLimitStore
 * with approximate in-memory limiting.
 */
export function createDegradeableRateLimitStore(
  primary: RateLimitStore | null,
): RateLimitStore {
  if (primary) return primary
  console.warn('[RateLimit] Redis unavailable — using local fallback rate limiter')
  return new LocalFallbackRateLimitStore()
}
