"use strict";
// ============================================================
// NOTIFICATION CONTRACT — copy + builder (spec §7)
// ============================================================
// buildNotification() is the ONE place that turns a business signal into a
// notification draft: WHAT (title) → WHY (body) → ACTION (button/label) →
// level → target → default dedupe key. Both the worker (record creation) and
// the frontend (rendering) consume the same builder, so push copy, in-app
// copy, deep links, and levels can never drift (spec §7/§8).
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatRupees = formatRupees;
exports.buildNotification = buildNotification;
const types_1 = require("./types");
const keys_1 = require("./keys");
function formatRupees(amount) {
    return `₹${Math.round(amount).toLocaleString('en-IN')}`;
}
const TYPE_TARGET = {
    'recovery.needs_you': 'customer',
    'recovery.promise_broken': 'customer',
    'recovery.payment_received': 'customer',
    'recovery.customer_replied': 'customer',
    'payment.received': 'invoice',
    'payment.unmatched': 'payment',
    'inventory.low_stock': 'product',
    'inventory.out_of_stock': 'product',
    'inventory.back_in_stock': 'product',
    'notification.test': 'notification',
};
function buildCopy(type, d) {
    switch (type) {
        case 'recovery.needs_you':
            return {
                title: `${d.customerName} needs your attention`,
                body: `${formatRupees(d.amount)} overdue`,
                action: 'Call customer today',
            };
        case 'recovery.promise_broken':
            return {
                title: `${d.customerName} needs your attention`,
                body: `${formatRupees(d.amount)} overdue · promise broken`,
                action: 'Call customer today',
            };
        case 'recovery.payment_received':
            return {
                title: 'Payment received — automation stopped',
                body: `${d.customerName} paid ${formatRupees(d.amount)}`,
                action: 'View recovery',
            };
        case 'recovery.customer_replied':
            return {
                title: `${d.customerName} replied`,
                body: 'Customer replied to your WhatsApp reminder',
                action: 'Open conversation',
            };
        case 'payment.received':
            return {
                title: `${formatRupees(d.amount)} received`,
                body: `${d.customerName}${d.invoiceNumber ? ` · Invoice ${d.invoiceNumber}` : ''}`,
                action: 'View payment',
            };
        case 'payment.unmatched':
            return {
                title: 'Payment received but unmatched',
                body: `${formatRupees(d.amount)} couldn't be matched to an invoice`,
                action: 'Review & match',
            };
        case 'inventory.low_stock':
            return {
                title: `${d.productName} is running low`,
                body: `${d.stock} units remaining · threshold is ${d.threshold}`,
                action: 'View inventory',
            };
        case 'inventory.out_of_stock':
            return {
                title: `${d.productName} is out of stock`,
                body: 'No units remaining',
                action: 'Restock product',
            };
        case 'inventory.back_in_stock':
            return {
                title: `${d.productName} is back in stock`,
                body: `${d.stock} units available`,
                action: 'View product',
            };
        case 'notification.test':
            return {
                title: d.title,
                body: d.body,
                action: 'Open Notifications',
            };
    }
}
// Builds the full record shape from a typed signal. The level, copy, target,
// and default dedupe key are all derived here.
function buildNotification(input) {
    const { type, data, tenantId, recipientUserId, dedupeKey } = input;
    const copy = buildCopy(type, data);
    const level = types_1.NOTIFICATION_TYPE_LEVEL[type];
    return {
        type,
        level,
        tenantId,
        recipientUserId: recipientUserId ?? null,
        title: copy.title,
        body: copy.body,
        targetType: TYPE_TARGET[type],
        targetId: data.targetId,
        action: copy.action,
        dedupeKey: dedupeKey ?? (0, keys_1.dedupeKeyFor)(type, data.targetId),
    };
}
//# sourceMappingURL=copy.js.map