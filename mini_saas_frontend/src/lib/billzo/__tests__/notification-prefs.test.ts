import { describe, expect, it } from 'vitest'
import {
  rowToPreferences,
  preferencesToRow,
  mergePreferences,
  type PreferencesPatch,
} from '../notification-prefs'
import { defaultNotificationPreferences } from '@billzo/shared'

describe('rowToPreferences', () => {
  it('echoes defaults when no row exists', () => {
    expect(rowToPreferences(null)).toEqual(defaultNotificationPreferences())
    expect(rowToPreferences(undefined)).toEqual(defaultNotificationPreferences())
  })

  it('maps a persisted row onto the contract', () => {
    const prefs = rowToPreferences({
      push_enabled: false,
      recovery: true,
      payments: false,
      inventory: true,
      back_in_stock: true,
      updated_at: '2026-09-13T00:00:00.000Z',
    })
    expect(prefs).toEqual({
      pushEnabled: false,
      recovery: true,
      payments: false,
      inventory: true,
      backInStock: true,
      updatedAt: '2026-09-13T00:00:00.000Z',
    })
  })

  it('falls back to per-field defaults for missing/nullable values', () => {
    const prefs = rowToPreferences({} as never)
    expect(prefs.pushEnabled).toBe(true)
    expect(prefs.backInStock).toBe(false)
    expect(prefs.updatedAt).toBeNull()
  })
})

describe('preferencesToRow', () => {
  it('serializes to migration 095 column names', () => {
    expect(preferencesToRow(defaultNotificationPreferences(), 'T')).toEqual({
      push_enabled: true,
      recovery: true,
      payments: true,
      inventory: true,
      back_in_stock: false,
      updated_at: 'T',
    })
  })
})

describe('mergePreferences', () => {
  it('applies only the patched fields and bumps updatedAt', () => {
    const merged = mergePreferences(defaultNotificationPreferences(), { inventory: false })
    expect(merged.inventory).toBe(false)
    expect(merged.recovery).toBe(true)
    expect(merged.payments).toBe(true)
    expect(merged.backInStock).toBe(false)
    expect(merged.updatedAt).toBeTruthy()
  })

  it('keeps default back-in-stock off unless explicitly enabled', () => {
    const merged = mergePreferences(defaultNotificationPreferences(), {} as PreferencesPatch)
    expect(merged.backInStock).toBe(false)
  })
})