import { describe, it, expect } from 'vitest'
import { splitCsvLine, normalizePhone, isValidPhone } from '../useContactImport'

describe('splitCsvLine (import parser)', () => {
  it('splits plain comma-separated values', () => {
    expect(splitCsvLine('Ravi,9876543210,john@x.com')).toEqual(['Ravi', '9876543210', 'john@x.com'])
  })

  it('keeps quoted commas inside a field (Tally-style names)', () => {
    expect(splitCsvLine('"Sharma, Sons",9876543210')).toEqual(['Sharma, Sons', '9876543210'])
  })

  it('unescapes doubled quotes', () => {
    expect(splitCsvLine('"Say ""Hi""",9876543210')).toEqual(['Say "Hi"', '9876543210'])
  })

  it('trims whitespace and strips surrounding quotes', () => {
    expect(splitCsvLine('  Ravi  , " 9876543210 " ')).toEqual(['Ravi', '9876543210'])
  })

  it('preserves empty trailing columns', () => {
    expect(splitCsvLine('Ravi,9876543210,,'.split(',').join(','))).toEqual(['Ravi', '9876543210', '', ''])
  })
})

describe('phone helpers (import pipeline)', () => {
  it('normalizes 10-digit to +91 E.164', () => {
    expect(normalizePhone('9876543210')).toBe('+919876543210')
  })

  it('normalizes 0-prefixed 11-digit', () => {
    expect(normalizePhone('09876543210')).toBe('+919876543210')
  })

  it('documents the empty-string edge: normalizePhone("") yields "+" (callers must guard)', () => {
    expect(normalizePhone('')).toBe('+')
    expect(isValidPhone('')).toBe(false)
  })

  it('validates 10–13 digit range', () => {
    expect(isValidPhone('9876543210')).toBe(true)
    expect(isValidPhone('123')).toBe(false)
  })
})
