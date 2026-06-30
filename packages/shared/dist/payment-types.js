"use strict";
// ============================================================
// PAYMENT TYPES — Unified Payment Ledger
// ============================================================
// These types describe payments flowing into the unified ledger.
// Every payment (regardless of source: Razorpay, cash, bank
// transfer, etc.) is recorded as a row in the `payments` table
// with a canonical `PaymentSource` enum value.
//
// The `outstanding_amount` on invoices is maintained by a
// Postgres trigger (`trg_maintain_invoice_outstanding`) that
// recalculates on every INSERT/UPDATE/DELETE to the payments
// table.
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.PAYMENT_LIFECYCLE_STATUSES = exports.PAYMENT_SOURCES = void 0;
exports.PAYMENT_SOURCES = [
    'cash',
    'razorpay',
    'bank_transfer',
    'cheque',
    'adjustment',
    'upi',
];
exports.PAYMENT_LIFECYCLE_STATUSES = [
    'created',
    'synced',
    'processed',
    'projected',
    'visible',
];
//# sourceMappingURL=payment-types.js.map