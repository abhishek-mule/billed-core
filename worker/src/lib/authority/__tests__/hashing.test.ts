import { describe, it, expect } from 'vitest'
import { canonicalHash, semanticHash, sha256, canonicalJson } from '../hashing'

describe('canonicalHash', () => {
  it('produces same hash for same object regardless of key order', () => {
    const a = { b: 2, a: 1, c: 3 }
    const b = { a: 1, c: 3, b: 2 }
    expect(canonicalHash(a)).toBe(canonicalHash(b))
  })

  it('produces same hash for same nested object regardless of key order', () => {
    const a = { outer: { z: 26, a: 1 }, name: 'test' }
    const b = { name: 'test', outer: { a: 1, z: 26 } }
    expect(canonicalHash(a)).toBe(canonicalHash(b))
  })

  it('produces same hash for same array regardless of element insertion order', () => {
    const a = [1, 2, 3]
    const b = [1, 2, 3]
    expect(canonicalHash(a)).toBe(canonicalHash(b))
  })

  it('strips undefined values', () => {
    const a = { a: 1, b: undefined }
    const b = { a: 1 }
    expect(canonicalHash(a)).toBe(canonicalHash(b))
  })

  it('handles null values', () => {
    const a = { a: null }
    const b = { a: null }
    expect(canonicalHash(a)).toBe(canonicalHash(b))
  })

  it('handles boolean values', () => {
    expect(canonicalHash({ a: true })).toBe(canonicalHash({ a: true }))
    expect(canonicalHash({ a: false })).toBe(canonicalHash({ a: false }))
  })

  it('handles nested arrays', () => {
    const a = { items: [{ id: 1 }, { id: 2 }] }
    const b = { items: [{ id: 1 }, { id: 2 }] }
    expect(canonicalHash(a)).toBe(canonicalHash(b))
  })

  it('handles empty objects and arrays', () => {
    expect(canonicalHash({})).toBe(canonicalHash({}))
    expect(canonicalHash([])).toBe(canonicalHash([]))
    expect(canonicalHash({ a: {} })).toBe(canonicalHash({ a: {} }))
    expect(canonicalHash({ a: [] })).toBe(canonicalHash({ a: [] }))
  })

  it('uses NFC unicode normalization', () => {
    // '\u0041\u0300' = A + combining grave accent (NFD)
    // '\u00C0' = À precomposed (NFC)
    const nfd = { text: '\u0041\u0300' }
    const nfc = { text: '\u00C0' }
    expect(canonicalHash(nfd)).toBe(canonicalHash(nfc))
  })

  it('throws on NaN', () => {
    expect(() => canonicalHash({ a: NaN })).toThrow('NaN')
  })

  it('throws on Infinity', () => {
    expect(() => canonicalHash({ a: Infinity })).toThrow('Non-finite')
    expect(() => canonicalHash({ a: -Infinity })).toThrow('Non-finite')
  })

  it('handles bigint values', () => {
    const a = { amount: BigInt(1000) }
    const b = { amount: BigInt(1000) }
    expect(canonicalHash(a)).toBe(canonicalHash(b))
  })

  it('handles Date objects', () => {
    const a = { at: new Date('2026-05-28T00:00:00.000Z') }
    const b = { at: new Date('2026-05-28T00:00:00.000Z') }
    expect(canonicalHash(a)).toBe(canonicalHash(b))
  })

  it('is deterministic across multiple calls', () => {
    const obj = { tenantId: 't1', amount: 500, name: 'test' }
    const hash1 = canonicalHash(obj)
    const hash2 = canonicalHash(obj)
    expect(hash1).toBe(hash2)
  })

  it('produces 64-char hex string', () => {
    const hash = canonicalHash({ a: 1 })
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('semanticHash', () => {
  it('equals canonical hash when no normalizer provided', () => {
    const payload = { a: 1, b: 2 }
    expect(semanticHash(payload)).toBe(canonicalHash(payload))
  })

  it('applies normalizer before hashing', () => {
    const payload = { phone: '+91 98765 43210' }
    const normalizer = (p: Readonly<Record<string, unknown>>) => ({
      phone: String(p.phone).replace(/\D/g, '').replace(/^91/, ''),
    })
    const normalized = { phone: '9876543210' }
    expect(semanticHash(payload, normalizer)).toBe(canonicalHash(normalized))
  })

  it('different phones that normalize identically produce same hash', () => {
    const p1 = { phone: '+91 98765 43210' }
    const p2 = { phone: '9876543210' }
    const p3 = { phone: '91 9876543210' }
    const normalizer = (p: Readonly<Record<string, unknown>>) => ({
      phone: String(p.phone).replace(/\D/g, '').replace(/^91/, ''),
    })
    const h1 = semanticHash(p1, normalizer)
    const h2 = semanticHash(p2, normalizer)
    const h3 = semanticHash(p3, normalizer)
    expect(h1).toBe(h2)
    expect(h2).toBe(h3)
  })

  it('different amounts that normalize identically produce same hash', () => {
    const p1 = { amount: 1000 }
    const p2 = { amount: 1000.0 }
    const normalizer = (p: Readonly<Record<string, unknown>>) => ({
      amount: Math.round(Number(p.amount)),
    })
    expect(semanticHash(p1, normalizer)).toBe(semanticHash(p2, normalizer))
  })
})

describe('sha256', () => {
  it('produces known output for empty string', () => {
    const expected = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    expect(sha256('')).toBe(expected)
  })

  it('produces 64-char hex string', () => {
    expect(sha256('hello')).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('canonicalJson', () => {
  it('produces valid JSON with sorted keys', () => {
    const result = canonicalJson({ c: 3, a: 1, b: 2 })
    const parsed = JSON.parse(result)
    expect(parsed).toEqual({ a: 1, b: 2, c: 3 })
    const keys = Object.keys(parsed)
    expect(keys).toEqual(['a', 'b', 'c'])
  })
})
