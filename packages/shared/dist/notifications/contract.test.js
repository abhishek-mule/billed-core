"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const index_1 = require("./index");
(0, vitest_1.describe)('getStockStatus (spec §4 threshold semantics)', () => {
    (0, vitest_1.it)('classifies above-threshold as NORMAL', () => {
        (0, vitest_1.expect)((0, index_1.getStockStatus)(10, 5)).toBe('NORMAL');
        (0, vitest_1.expect)((0, index_1.getStockStatus)(6, 5)).toBe('NORMAL');
    });
    (0, vitest_1.it)('classifies 0 < stock <= threshold as LOW_STOCK', () => {
        (0, vitest_1.expect)((0, index_1.getStockStatus)(5, 5)).toBe('LOW_STOCK');
        (0, vitest_1.expect)((0, index_1.getStockStatus)(4, 5)).toBe('LOW_STOCK');
        (0, vitest_1.expect)((0, index_1.getStockStatus)(1, 5)).toBe('LOW_STOCK');
    });
    (0, vitest_1.it)('classifies stock <= 0 as OUT_OF_STOCK', () => {
        (0, vitest_1.expect)((0, index_1.getStockStatus)(0, 5)).toBe('OUT_OF_STOCK');
        (0, vitest_1.expect)((0, index_1.getStockStatus)(-2, 5)).toBe('OUT_OF_STOCK');
    });
    (0, vitest_1.it)('only reports a transition when the state actually changes', () => {
        (0, vitest_1.expect)((0, index_1.isStockTransition)('NORMAL', 'LOW_STOCK')).toBe(true);
        (0, vitest_1.expect)((0, index_1.isStockTransition)('LOW_STOCK', 'OUT_OF_STOCK')).toBe(true);
        (0, vitest_1.expect)((0, index_1.isStockTransition)('LOW_STOCK', 'LOW_STOCK')).toBe(false);
        (0, vitest_1.expect)((0, index_1.isStockTransition)('NORMAL', 'NORMAL')).toBe(false);
    });
});
(0, vitest_1.describe)('dedupe keys (spec §12)', () => {
    (0, vitest_1.it)('builds entity + state-scoped keys', () => {
        (0, vitest_1.expect)((0, index_1.dedupeKeyFor)('inventory.low_stock', 'product_456')).toBe('inventory.low_stock:product_456');
        (0, vitest_1.expect)((0, index_1.dedupeKeyFor)('inventory.low_stock', 'product_456', 'LOW_STOCK')).toBe('inventory.low_stock:product_456:LOW_STOCK');
    });
    (0, vitest_1.it)('builds event-sourced keys for exactly-once transition alerts', () => {
        (0, vitest_1.expect)((0, index_1.dedupeKeyForEvent)('recovery.promise_broken', 'evt_001')).toBe('recovery.promise_broken:evt:evt_001');
    });
});
(0, vitest_1.describe)('buildNotification (spec §7 WHAT → WHY → ACTION)', () => {
    (0, vitest_1.it)('builds a promise-broken critical alert for the recovery target', () => {
        const n = (0, index_1.buildNotification)({
            type: 'recovery.promise_broken',
            data: { customerName: 'Rahul Chemical', amount: 6400, targetId: 'cust_123' },
            tenantId: 'tenant_1',
        });
        (0, vitest_1.expect)(n.level).toBe('critical');
        (0, vitest_1.expect)(n.title).toBe('Rahul Chemical needs your attention');
        (0, vitest_1.expect)(n.body).toBe('₹6,400 overdue · promise broken');
        (0, vitest_1.expect)(n.action).toBe('Call customer today');
        (0, vitest_1.expect)(n.targetType).toBe('customer');
        (0, vitest_1.expect)(n.targetId).toBe('cust_123');
        (0, vitest_1.expect)(n.dedupeKey).toBe('recovery.promise_broken:cust_123');
    });
    (0, vitest_1.it)('deep links recovery to the exact customer screen', () => {
        const n = (0, index_1.buildNotification)({
            type: 'recovery.promise_broken',
            data: { customerName: 'Rahul Chemical', amount: 6400, targetId: 'cust_123' },
            tenantId: 'tenant_1',
        });
        (0, vitest_1.expect)((0, index_1.notificationDeepLink)({ targetType: n.targetType, targetId: n.targetId })).toBe('/recovery/customer/cust_123');
        (0, vitest_1.expect)((0, index_1.notificationDeepLinkAbsolute)({ targetType: n.targetType, targetId: n.targetId }, 'https://billzo.in')).toBe('https://billzo.in/recovery/customer/cust_123');
    });
    (0, vitest_1.it)('builds a low-stock attention alert for the product target', () => {
        const n = (0, index_1.buildNotification)({
            type: 'inventory.low_stock',
            data: { productName: 'PVC Pipe', stock: 4, threshold: 5, targetId: 'product_456' },
            tenantId: 'tenant_1',
        });
        (0, vitest_1.expect)(n.level).toBe('attention');
        (0, vitest_1.expect)(n.title).toBe('PVC Pipe is running low');
        (0, vitest_1.expect)(n.body).toBe('4 units remaining · threshold is 5');
        (0, vitest_1.expect)(n.action).toBe('View inventory');
        (0, vitest_1.expect)(n.targetType).toBe('product');
        (0, vitest_1.expect)((0, index_1.notificationDeepLink)({ targetType: n.targetType, targetId: n.targetId })).toBe('/products/product_456');
    });
    (0, vitest_1.it)('builds a payment-received info alert targeting the invoice', () => {
        const n = (0, index_1.buildNotification)({
            type: 'payment.received',
            data: { customerName: 'ABC Traders', amount: 2500, invoiceNumber: 'INV-1024', targetId: 'invoice_9' },
            tenantId: 'tenant_1',
        });
        (0, vitest_1.expect)(n.level).toBe('info');
        (0, vitest_1.expect)(n.title).toBe('₹2,500 received');
        (0, vitest_1.expect)(n.body).toBe('ABC Traders · Invoice INV-1024');
        (0, vitest_1.expect)((0, index_1.notificationDeepLink)({ targetType: n.targetType, targetId: n.targetId })).toBe('/invoices/invoice_9');
    });
    (0, vitest_1.it)('maps unmatched payments to the payments ledger', () => {
        const n = (0, index_1.buildNotification)({
            type: 'payment.unmatched',
            data: { amount: 3500, targetId: 'payment_77' },
            tenantId: 'tenant_1',
        });
        (0, vitest_1.expect)(n.level).toBe('critical');
        (0, vitest_1.expect)((0, index_1.notificationDeepLink)({ targetType: n.targetType, targetId: n.targetId })).toBe('/pulse');
    });
    (0, vitest_1.it)('honours an explicit dedupe override (cycle-scoped inventory re-alert)', () => {
        const n = (0, index_1.buildNotification)({
            type: 'inventory.low_stock',
            data: { productName: 'PVC Pipe', stock: 3, threshold: 5, targetId: 'product_456' },
            tenantId: 'tenant_1',
            dedupeKey: (0, index_1.dedupeKeyFor)('inventory.low_stock', 'product_456', 'LOW_STOCK:2'),
        });
        (0, vitest_1.expect)(n.dedupeKey).toBe('inventory.low_stock:product_456:LOW_STOCK:2');
    });
    (0, vitest_1.it)('builds a test notification (system category, info level, center target)', () => {
        const n = (0, index_1.buildNotification)({
            type: 'notification.test',
            data: { title: 'Test from BillZo', body: 'This is a test.', targetId: 'tenant_1' },
            tenantId: 'tenant_1',
        });
        (0, vitest_1.expect)(n.level).toBe('info');
        (0, vitest_1.expect)(index_1.NOTIFICATION_TYPE_CATEGORY['notification.test']).toBe('system');
        (0, vitest_1.expect)(n.action).toBe('Open Notifications');
        (0, vitest_1.expect)((0, index_1.notificationDeepLink)({ targetType: n.targetType, targetId: n.targetId })).toBe('/notifications');
        (0, vitest_1.expect)((0, index_1.shouldNotify)((0, index_1.defaultNotificationPreferences)(), 'notification.test')).toBe(true);
    });
    (0, vitest_1.it)('renders every supported type with non-empty copy', () => {
        for (const type of index_1.NOTIFICATION_TYPES) {
            const level = index_1.NOTIFICATION_TYPE_LEVEL[type];
            const category = index_1.NOTIFICATION_TYPE_CATEGORY[type];
            (0, vitest_1.expect)(level).toBeTruthy();
            (0, vitest_1.expect)(category).toBeTruthy();
        }
    });
});
(0, vitest_1.describe)('formatRupees', () => {
    (0, vitest_1.it)('formats Indian number grouping', () => {
        (0, vitest_1.expect)((0, index_1.formatRupees)(6400)).toBe('₹6,400');
        (0, vitest_1.expect)((0, index_1.formatRupees)(250000)).toBe('₹2,50,000');
    });
});
(0, vitest_1.describe)('preferences (defaults + gate, spec §10)', () => {
    (0, vitest_1.it)('echoes defaults with back-in-stock off', () => {
        const p = (0, index_1.defaultNotificationPreferences)();
        (0, vitest_1.expect)(p.pushEnabled).toBe(true);
        (0, vitest_1.expect)(p.recovery).toBe(true);
        (0, vitest_1.expect)(p.payments).toBe(true);
        (0, vitest_1.expect)(p.inventory).toBe(true);
        (0, vitest_1.expect)(p.backInStock).toBe(false);
    });
    (0, vitest_1.it)('default gate passes all phase-1 types except opt-in back-in-stock', () => {
        const p = (0, index_1.defaultNotificationPreferences)();
        for (const type of index_1.NOTIFICATION_TYPES) {
            if (type === 'inventory.back_in_stock') {
                (0, vitest_1.expect)((0, index_1.shouldNotify)(p, type)).toBe(false);
            }
            else {
                (0, vitest_1.expect)((0, index_1.shouldNotify)(p, type)).toBe(true);
            }
        }
    });
    (0, vitest_1.it)('gates back-in-stock behind its opt-in preference', () => {
        const p = (0, index_1.defaultNotificationPreferences)();
        (0, vitest_1.expect)((0, index_1.shouldNotify)(p, 'inventory.back_in_stock')).toBe(false);
        (0, vitest_1.expect)((0, index_1.shouldNotify)({ ...p, backInStock: true, updatedAt: null }, 'inventory.back_in_stock')).toBe(true);
    });
    (0, vitest_1.it)('never blocks delivery when preferences are absent (defensive default)', () => {
        (0, vitest_1.expect)((0, index_1.shouldNotify)(null, 'recovery.promise_broken')).toBe(true);
        (0, vitest_1.expect)((0, index_1.shouldNotify)(undefined, 'recovery.promise_broken')).toBe(true);
    });
});
//# sourceMappingURL=contract.test.js.map