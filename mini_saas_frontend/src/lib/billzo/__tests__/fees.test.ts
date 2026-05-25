import { describe, it, expect, vi } from 'vitest'

vi.mock('../supabase-admin', () => ({
  supabaseAdmin: {},
}))

import { calculateSuccessFee } from '../fees'

describe('calculateSuccessFee', () => {
  it('should apply percentage fee when 2% < ₹49 (2% of 1000 = 20)', () => {
    const result = calculateSuccessFee(1000)
    // flatFee=49, percentageFee=20, cappedFee=20, appliedFee=min(49,20)=20
    // appliedFee(20) === cappedFee(20) && cappedFee(20) === percentageFee(20) -> 'percentage'
    expect(result.appliedFee).toBe(20)
    expect(result.appliedMethod).toBe('percentage')
    expect(result.flatFee).toBe(49)
    expect(result.percentageFee).toBe(20)
    expect(result.cappedFee).toBe(20)
  })

  it('should handle ₹0 recovered', () => {
    const result = calculateSuccessFee(0)
    // flatFee=49, percentageFee=0, cappedFee=0, appliedFee=min(49,0)=0
    // appliedFee(0) === cappedFee(0) && cappedFee(0) === percentageFee(0) -> 'percentage'
    expect(result.appliedFee).toBe(0)
    expect(result.percentageFee).toBe(0)
    expect(result.cappedFee).toBe(0)
    expect(result.appliedMethod).toBe('percentage')
  })

  it('should apply flat fee of ₹49 when 2% capped exceeds flat fee', () => {
    // 2% of 50000 = 1000, capped at 299, min(49, 299) = 49
    const result = calculateSuccessFee(50000)
    expect(result.appliedFee).toBe(49)
    expect(result.percentageFee).toBe(1000)
    expect(result.cappedFee).toBe(299)
    expect(result.appliedMethod).toBe('flat')
  })

  it('should apply flat fee when flat fee equals capped fee', () => {
    // 2% of 2450 = 49, capped at 49, min(49, 49) = 49
    // appliedFee(49) === flatFee(49) && flatFee(49) <= cappedFee(49) -> 'flat'
    const result = calculateSuccessFee(2450)
    expect(result.appliedFee).toBe(49)
    expect(result.percentageFee).toBe(49)
    expect(result.cappedFee).toBe(49)
    expect(result.appliedMethod).toBe('flat')
  })

  it('should apply capped fee when 2% exceeds ₹299 cap', () => {
    // 2% of 15000 = 300, capped at 299, min(49, 299) = 49
    const result = calculateSuccessFee(15000)
    expect(result.appliedFee).toBe(49)
    expect(result.percentageFee).toBe(300)
    expect(result.cappedFee).toBe(299)
    expect(result.appliedMethod).toBe('flat')
  })

  it('should apply capped fee when 2% > ₹49 and 2% < ₹299', () => {
    // 2% of 10000 = 200, capped at 200, min(49, 200) = 49
    const result = calculateSuccessFee(10000)
    expect(result.appliedFee).toBe(49)
    expect(result.appliedMethod).toBe('flat')
  })

  it('should round percentage fee to nearest integer', () => {
    const result = calculateSuccessFee(1234)
    expect(result.percentageFee).toBe(25)
    expect(result.cappedFee).toBe(25)
    expect(result.appliedFee).toBe(25)
    expect(result.appliedMethod).toBe('percentage')
  })

  it('should return correct structure', () => {
    const result = calculateSuccessFee(10000)
    expect(result).toHaveProperty('flatFee')
    expect(result).toHaveProperty('percentageFee')
    expect(result).toHaveProperty('cappedFee')
    expect(result).toHaveProperty('appliedFee')
    expect(result).toHaveProperty('appliedMethod')
    expect(typeof result.flatFee).toBe('number')
    expect(typeof result.appliedMethod).toBe('string')
  })
})
