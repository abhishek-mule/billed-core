"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RECOVERY_ACTOR_TYPES = exports.RECOVERY_EVENT_TYPES = void 0;
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
//# sourceMappingURL=normalized-event.js.map