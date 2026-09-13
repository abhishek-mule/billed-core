// ============================================================
// NOTIFICATION CONTRACT — types
// ============================================================
// Single source of truth shared by the worker (server-authoritative
// creators) and the frontend (notification center / push copy).
//
// The DB table `notifications` (migration 095) mirrors NotificationRecord
// 1:1 so records survive independently of push delivery. Push is only a
// DELIVERY MECHANISM; this table is the in-app source of truth.
// ============================================================

// ── Level (drives center color + urgency, spec §6) ──
export const NOTIFICATION_LEVELS = ['critical', 'attention', 'info'] as const
export type NotificationLevel = (typeof NOTIFICATION_LEVELS)[number]

// ── Category (drives the preference gate; `system` is never gated) ──
export const NOTIFICATION_CATEGORIES = ['recovery', 'payments', 'inventory', 'system'] as const
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number]

// ── Type ──
// Phase 1 set (spec §15): recovery needs-you / replied / payment received /
// promise broken, payment received / unmatched, low stock / out of stock.
// inventory.back_in_stock is defined but OFF by default.
// notification.test is a system message that ignores preferences; it exercises
// the full record-first → (SSE / FCM) delivery chain from the settings screen.
export const NOTIFICATION_TYPES = [
  'recovery.needs_you',
  'recovery.promise_broken',
  'recovery.payment_received',
  'recovery.customer_replied',
  'payment.received',
  'payment.unmatched',
  'inventory.low_stock',
  'inventory.out_of_stock',
  'inventory.back_in_stock',
  'notification.test',
] as const
export type NotificationType = (typeof NOTIFICATION_TYPES)[number]

export const NOTIFICATION_TYPE_LEVEL: Record<NotificationType, NotificationLevel> = {
  'recovery.needs_you': 'critical',
  'recovery.promise_broken': 'critical',
  'recovery.payment_received': 'info',
  'recovery.customer_replied': 'attention',
  'payment.received': 'info',
  'payment.unmatched': 'critical',
  'inventory.low_stock': 'attention',
  'inventory.out_of_stock': 'critical',
  'inventory.back_in_stock': 'info',
  'notification.test': 'info',
}

export const NOTIFICATION_TYPE_CATEGORY: Record<NotificationType, NotificationCategory> = {
  'recovery.needs_you': 'recovery',
  'recovery.promise_broken': 'recovery',
  'recovery.payment_received': 'recovery',
  'recovery.customer_replied': 'recovery',
  'payment.received': 'payments',
  'payment.unmatched': 'payments',
  'inventory.low_stock': 'inventory',
  'inventory.out_of_stock': 'inventory',
  'inventory.back_in_stock': 'inventory',
  'notification.test': 'system',
}

// ── Target (deep link destination, spec §8) ──
export const NOTIFICATION_TARGET_TYPES = ['customer', 'case', 'invoice', 'payment', 'product', 'notification'] as const
export type NotificationTargetType = (typeof NOTIFICATION_TARGET_TYPES)[number]

// targetId may be null when the source didn't carry a concrete id (e.g. an
// unattributed payment). TARGET_ROUTES still resolve to a sensible fallback.
export interface NotificationTarget {
  targetType: NotificationTargetType
  targetId: string | null
}

// ── Record / draft (mirrors migration 095 `notifications`) ──
export interface NewNotification {
  tenantId: string
  recipientUserId?: string | null
  type: NotificationType
  level: NotificationLevel
  title: string
  body: string
  targetType: NotificationTargetType
  targetId: string
  action: string
  dedupeKey: string
}

export interface NotificationRecord {
  id: string
  tenantId: string
  recipientUserId: string | null
  type: NotificationType
  level: NotificationLevel
  title: string
  body: string | null
  targetType: NotificationTargetType
  targetId: string | null
  action: string
  dedupeKey: string
  isRead: boolean
  createdAt: string
}

// ── Preferences (migration 095 `notification_preferences`, pure data) ──
export interface NotificationPreferences {
  pushEnabled: boolean
  recovery: boolean
  payments: boolean
  inventory: boolean
  backInStock: boolean
  updatedAt: string | null
}

export const DEFAULT_NOTIFICATION_PREFERENCES: Omit<NotificationPreferences, 'updatedAt'> = {
  pushEnabled: true,
  recovery: true,
  payments: true,
  inventory: true,
  backInStock: false,
}

export function defaultNotificationPreferences(): NotificationPreferences {
  return { ...DEFAULT_NOTIFICATION_PREFERENCES, updatedAt: null }
}

// The preference gate applied BEFORE a notification record is created.
// back_in_stock is OFF by default (opt-in) to keep merchant noise down.
export function shouldNotify(preferences: NotificationPreferences | null | undefined, type: NotificationType): boolean {
  if (!preferences) return true
  switch (NOTIFICATION_TYPE_CATEGORY[type]) {
    case 'recovery':
      return preferences.recovery
    case 'payments':
      return preferences.payments
    case 'inventory':
      return type === 'inventory.back_in_stock' ? preferences.backInStock : preferences.inventory
    case 'system':
      // System messages (e.g. notification.test) are explicit actions, never gated.
      return true
  }
}

// ── Inventory alert state (spec §4) ──
export const PRODUCT_ALERT_STATES = ['NORMAL', 'LOW_STOCK', 'OUT_OF_STOCK'] as const
export type ProductAlertState = (typeof PRODUCT_ALERT_STATES)[number]