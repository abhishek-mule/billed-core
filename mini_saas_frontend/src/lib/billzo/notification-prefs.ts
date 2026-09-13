// ============================================================
// NOTIFICATION PREFERENCES — server-side row ↔ contract mapping
// ============================================================
// Pure mapping between the `notification_preferences` DB row (migration 095)
// and the shared NotificationPreferences contract — used by GET/PUT
// /api/notifications/preferences. Absent rows always resolve to defaults
// (back_in_stock OFF); PUT merges only the fields the client sends.

import { defaultNotificationPreferences, type NotificationPreferences } from '@billzo/shared'

export interface NotificationPrefsRow {
  push_enabled: boolean
  recovery: boolean
  payments: boolean
  inventory: boolean
  back_in_stock: boolean
  updated_at: string | null
}

export function rowToPreferences(row: NotificationPrefsRow | null | undefined): NotificationPreferences {
  const defaults = defaultNotificationPreferences()
  if (!row) return defaults
  return {
    pushEnabled: row.push_enabled ?? defaults.pushEnabled,
    recovery: row.recovery ?? defaults.recovery,
    payments: row.payments ?? defaults.payments,
    inventory: row.inventory ?? defaults.inventory,
    backInStock: row.back_in_stock ?? defaults.backInStock,
    updatedAt: row.updated_at ?? null,
  }
}

export function preferencesToRow(prefs: NotificationPreferences, now: string): NotificationPrefsRow {
  return {
    push_enabled: prefs.pushEnabled,
    recovery: prefs.recovery,
    payments: prefs.payments,
    inventory: prefs.inventory,
    back_in_stock: prefs.backInStock,
    updated_at: now,
  }
}

export type PreferencesPatch = Partial<Pick<NotificationPreferences, 'pushEnabled' | 'recovery' | 'payments' | 'inventory' | 'backInStock'>>

export function mergePreferences(current: NotificationPreferences, patch: PreferencesPatch): NotificationPreferences {
  return {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  }
}