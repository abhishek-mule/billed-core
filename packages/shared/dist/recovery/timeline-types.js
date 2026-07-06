"use strict";
// ============================================================
// TIMELINE TYPES — Recovery Journey event model
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.RECOVERY_TIMELINE_EVENT_TYPES = exports.RECOVERY_TIMELINE_SOURCES = exports.RECOVERY_TIMELINE_SEVERITIES = void 0;
exports.RECOVERY_TIMELINE_SEVERITIES = ['info', 'success', 'warning', 'error', 'future'];
exports.RECOVERY_TIMELINE_SOURCES = ['system', 'merchant', 'worker', 'customer', 'ai'];
exports.RECOVERY_TIMELINE_EVENT_TYPES = [
    'invoice_created',
    'reminder_scheduled',
    'reminder_sent',
    'reminder_delivered',
    'reminder_read',
    'reminder_failed',
    'payment_link_clicked',
    'payment_received',
    'payment_failed',
    'escalated',
    'manual_review',
    'action_pending',
    'case_closed',
    'disputed',
];
//# sourceMappingURL=timeline-types.js.map