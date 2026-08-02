import { describe, expect, it } from 'vitest'
import { getErrorMessage } from '../ui-errors'

describe('getErrorMessage', () => {
  it('returns the direct error message when available', () => {
    expect(getErrorMessage(new Error('Something went wrong'))).toBe('Something went wrong')
  })

  it('extracts API error payloads', () => {
    expect(getErrorMessage({ error: 'Validation failed' }, 'Fallback')).toBe('Validation failed')
  })

  it('falls back to a friendly default when no message exists', () => {
    expect(getErrorMessage(undefined, 'Unable to complete request')).toBe('Unable to complete request')
  })
})
