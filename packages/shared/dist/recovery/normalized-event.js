"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LEGACY_RECOVERY_EVENT_TYPES = exports.RECOVERY_ACTOR_TYPES = exports.RECOVERY_EVENT_TYPES = void 0;
exports.RECOVERY_EVENT_TYPES = [
    // Lifecycle
    'case_opened',
    'case_closed',
    // Communication
    'invoice_sent',
    'reminder_scheduled',
    'reminder_sent',
    'reminder_delivered',
    'reminder_read',
    'reminder_failed',
    'merchant_called',
    'call_outcome',
    // Promise
    'promise_received',
    'promise_fulfilled',
    'promise_broken',
    // Payment
    'customer_viewed',
    'payment_link_opened',
    'payment_received',
    'customer_payment_reported',
    'payment_confirmed',
    'payment_failed',
    // Merchant notes
    'note_added',
    'escalated',
    'disputed',
];
exports.RECOVERY_ACTOR_TYPES = ['merchant', 'system', 'customer'];
/**
 * Legacy normalized event shape consumed by the Learning Engine and its
 * feature extractors. Kept alongside RecoveryEvent (the canonical model)
 * because those modules were written against the earlier event vocabulary
 * (timestamp + types like payment_link_clicked / snooze_requested).
 */
exports.LEGACY_RECOVERY_EVENT_TYPES = [
    'invoice_created',
    'reminder_sent',
    'reminder_delivered',
    'reminder_read',
    'payment_link_clicked',
    'payment_received',
    'partial_payment',
    'promise_created',
    'promise_kept',
    'promise_broken',
    'call',
    'visit',
    'manual_note',
    'snooze_requested',
];
//# sourceMappingURL=normalized-event.js.map