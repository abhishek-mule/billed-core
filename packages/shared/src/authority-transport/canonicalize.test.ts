import { describe, it, expect } from 'vitest'
import { canonicalJson, CANONICAL_JSON_VERSION, CanonicalJsonError } from './canonicalize'

describe('canonicalJson v1', () => {
  it('sorts object keys deterministically', () => {
    const result = canonicalJson({ z: 1, a: 2, m: 3 })
    expect(result).toMatchSnapshot('sorted-keys')
  })

  it('strips undefined values', () => {
    const result = canonicalJson({ a: 1, b: undefined, c: null })
    expect(result).toMatchSnapshot('strip-undefined')
  })

  it('keeps null values', () => {
    const result = canonicalJson({ a: null })
    expect(result).toMatchSnapshot('keep-null')
  })

  it('normalizes unicode to NFC', () => {
    const composed = '\u00E9'
    const decomposed = '\u0065\u0301'
    expect(canonicalJson({ val: composed })).toBe(canonicalJson({ val: decomposed }))
    expect(canonicalJson({ val: composed })).toMatchSnapshot('unicode-nfc')
  })

  it('rejects NaN', () => {
    expect(() => canonicalJson({ a: NaN })).toThrow(CanonicalJsonError)
  })

  it('rejects Infinity', () => {
    expect(() => canonicalJson({ a: Infinity })).toThrow(CanonicalJsonError)
  })

  it('rejects -Infinity', () => {
    expect(() => canonicalJson({ a: -Infinity })).toThrow(CanonicalJsonError)
  })

  it('rejects BigInt', () => {
    expect(() => canonicalJson({ a: BigInt(42) })).toThrow(CanonicalJsonError)
  })

  it('serializes Date to ISO string', () => {
    const d = new Date('2026-05-28T12:00:00.000Z')
    const result = canonicalJson({ timestamp: d })
    expect(result).toMatchSnapshot('date-iso')
  })

  it('handles empty objects', () => {
    expect(canonicalJson({})).toMatchSnapshot('empty-object')
  })

  it('handles empty arrays', () => {
    expect(canonicalJson([])).toMatchSnapshot('empty-array')
  })

  it('handles nested objects', () => {
    const input = { outer: { z: 1, a: 2 }, list: [3, 1, 2] }
    expect(canonicalJson(input)).toMatchSnapshot('nested')
  })

  it('handles arrays of objects', () => {
    const input = [{ b: 2, a: 1 }, { d: 4, c: 3 }]
    expect(canonicalJson(input)).toMatchSnapshot('array-of-objects')
  })

  it('handles mixed-type arrays', () => {
    const input = { items: [1, 'two', true, null, { a: 1 }] }
    expect(canonicalJson(input)).toMatchSnapshot('mixed-array')
  })

  it('produces deterministic output for same input', () => {
    const a = { b: 2, a: 1 }
    const b = { a: 1, b: 2 }
    expect(canonicalJson(a)).toBe(canonicalJson(b))
  })

  it('handles deeply nested key ordering', () => {
    const input = { level1: { level2: { c: 3, b: 2, a: 1 } } }
    expect(canonicalJson(input)).toMatchSnapshot('deep-nested')
  })

  it('handles boolean and number primitives at root', () => {
    expect(canonicalJson(true)).toMatchSnapshot('root-boolean')
    expect(canonicalJson(42)).toMatchSnapshot('root-number')
    expect(canonicalJson('hello')).toMatchSnapshot('root-string')
  })

  it('exports the current version', () => {
    expect(CANONICAL_JSON_VERSION).toBe(1)
  })
})
