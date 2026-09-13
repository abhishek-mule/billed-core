"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.PRODUCT_ALERT_STATES = exports.DEFAULT_NOTIFICATION_PREFERENCES = exports.NOTIFICATION_TARGET_TYPES = exports.NOTIFICATION_TYPE_CATEGORY = exports.NOTIFICATION_TYPE_LEVEL = exports.NOTIFICATION_TYPES = exports.NOTIFICATION_CATEGORIES = exports.NOTIFICATION_LEVELS = void 0;
exports.defaultNotificationPreferences = defaultNotificationPreferences;
exports.shouldNotify = shouldNotify;
// ── Level (drives center color + urgency, spec §6) ──
exports.NOTIFICATION_LEVELS = ['critical', 'attention', 'info'];
// ── Category (drives the preference gate; `system` is never gated) ──
exports.NOTIFICATION_CATEGORIES = ['recovery', 'payments', 'inventory', 'system'];
// ── Type ──
// Phase 1 set (spec §15): recovery needs-you / replied / payment received /
// promise broken, payment received / unmatched, low stock / out of stock.
// inventory.back_in_stock is defined but OFF by default.
// notification.test is a system message that ignores preferences; it exercises
// the full record-first → (SSE / FCM) delivery chain from the settings screen.
exports.NOTIFICATION_TYPES = [
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
];
exports.NOTIFICATION_TYPE_LEVEL = {
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
};
exports.NOTIFICATION_TYPE_CATEGORY = {
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
};
// ── Target (deep link destination, spec §8) ──
exports.NOTIFICATION_TARGET_TYPES = ['customer', 'case', 'invoice', 'payment', 'product', 'notification'];
exports.DEFAULT_NOTIFICATION_PREFERENCES = {
    pushEnabled: true,
    recovery: true,
    payments: true,
    inventory: true,
    backInStock: false,
};
function defaultNotificationPreferences() {
    return { ...exports.DEFAULT_NOTIFICATION_PREFERENCES, updatedAt: null };
}
// The preference gate applied BEFORE a notification record is created.
// back_in_stock is OFF by default (opt-in) to keep merchant noise down.
function shouldNotify(preferences, type) {
    if (!preferences)
        return true;
    switch (exports.NOTIFICATION_TYPE_CATEGORY[type]) {
        case 'recovery':
            return preferences.recovery;
        case 'payments':
            return preferences.payments;
        case 'inventory':
            return type === 'inventory.back_in_stock' ? preferences.backInStock : preferences.inventory;
        case 'system':
            // System messages (e.g. notification.test) are explicit actions, never gated.
            return true;
    }
}
// ── Inventory alert state (spec §4) ──
exports.PRODUCT_ALERT_STATES = ['NORMAL', 'LOW_STOCK', 'OUT_OF_STOCK'];
//# sourceMappingURL=types.js.map