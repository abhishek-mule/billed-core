import { describe, it, expect } from 'vitest'
import {
  RECOVERY_CREDITS_DEFERRED_REASON,
  recoveryCreditsAvailable,
  recoveryCreditsExhausted,
  selectPoolForConsumption,
  includedBalanceAfterConsumption,
  recoveryCreditPeriodPlan,
} from '../credits'
import {
  RECOVERY_CREDIT_PACKETS,
  RECOVERY_CREDIT_MONTHLY_ALLOWANCE,
  recoveryCreditPacketByCode,
  recoveryCreditMonthlyAllowance,
  billzoPlanOf,
} from '../../plan-limits'

describe('recovery credit math', () => {
  it('sums both pools for the available balance', () => {
    expect(recoveryCreditsAvailable({ included: 12, purchased: 30 })).toBe(42)
    expect(recoveryCreditsAvailable({ included: 0, purchased: 0 })).toBe(0)
  })

  it('is exhausted only when there is nothing spendable left', () => {
    expect(recoveryCreditsExhausted({ included: 0, purchased: 0 })).toBe(true)
    expect(recoveryCreditsExhausted({ included: 1, purchased: 0 })).toBe(false)
    expect(recoveryCreditsExhausted({ included: 0, purchased: 500 })).toBe(false)
  })

  it('spends the included pool first, then purchased', () => {
    expect(selectPoolForConsumption({ included: 5, purchased: 5 })).toBe('included')
    expect(selectPoolForConsumption({ included: 0, purchased: 5 })).toBe('purchased')
    expect(selectPoolForConsumption({ included: 0, purchased: 0 })).toBeNull()
  })

  it('decrements the included pool but never goes negative', () => {
    expect(includedBalanceAfterConsumption({ included: 5, purchased: 9 })).toBe(4)
    expect(includedBalanceAfterConsumption({ included: 0, purchased: 9 })).toBe(0)
  })

  it('audits period boundaries as expire-all + fresh allocation', () => {
    const withResidual = recoveryCreditPeriodPlan(23, 200)
    expect(withResidual.expiryQuantity).toBe(23)
    expect(withResidual.allocationQuantity).toBe(200)

    const clean = recoveryCreditPeriodPlan(0, 200)
    expect(clean.expiryQuantity).toBe(0)
    expect(clean.allocationQuantity).toBe(200)
  })

  it('uses a stable, immutable deferral reason string', () => {
    expect(RECOVERY_CREDITS_DEFERRED_REASON).toBe('deferred_due_to_credits')
  })
})

describe('credit catalog', () => {
  it('ships the four published plans', () => {
    expect(RECOVERY_CREDIT_MONTHLY_ALLOWANCE).toEqual({
      starter: 50,
      pro: 200,
      business: 750,
      enterprise: 750,
    })
  })

  it('resolves allowance through billzoPlanOf without throwing on legacy input', () => {
    expect(recoveryCreditMonthlyAllowance(billzoPlanOf('starter'))).toBe(50)
    expect(recoveryCreditMonthlyAllowance(billzoPlanOf('pro'))).toBe(200)
    expect(recoveryCreditMonthlyAllowance(billzoPlanOf('business'))).toBe(750)
    expect(recoveryCreditMonthlyAllowance(billzoPlanOf('enterprise'))).toBe(750)
  })

  it('looks up packets server-side by code and rejects unknown codes', () => {
    expect(recoveryCreditPacketByCode('credits_50')).toEqual(RECOVERY_CREDIT_PACKETS[0])
    expect(recoveryCreditPacketByCode('credits_250')?.credits).toBe(250)
    expect(recoveryCreditPacketByCode('credits_nope')).toBeNull()
  })

  it('keeps packets distinct with strictly positive pricing', () => {
    const codes = new Set(RECOVERY_CREDIT_PACKETS.map((p) => p.code))
    expect(codes.size).toBe(RECOVERY_CREDIT_PACKETS.length)
    for (const p of RECOVERY_CREDIT_PACKETS) {
      expect(p.credits).toBeGreaterThan(0)
      expect(p.pricePaise).toBeGreaterThan(0)
    }
  })
})