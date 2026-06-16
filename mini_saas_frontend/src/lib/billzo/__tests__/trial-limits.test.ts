import { describe, it, expect } from 'vitest'
import { TRIAL_LIMITS } from '../trial-limits'

describe('trial-limits', () => {
  it('maxCustomers is 50', () => {
    expect(TRIAL_LIMITS.maxCustomers).toBe(50)
  })

  it('values are correct', () => {
    expect(TRIAL_LIMITS).toEqual({ maxCustomers: 50 })
  })
})
