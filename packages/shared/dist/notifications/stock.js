"use strict";
// ============================================================
// NOTIFICATION CONTRACT — inventory alert state (spec §4)
// ============================================================
// threshold semantics:
//   stock > threshold  → NORMAL
//   0 < stock <= threshold → LOW_STOCK
//   stock <= 0         → OUT_OF_STOCK
//
// Rule: notify on TRANSITION, never repeatedly while stock lingers below
// the threshold. The server endpoint (Phase 3) reads product_alert_cycle,
// compares getStockStatus(prev) vs getStockStatus(next), and only creates a
// notification when the state actually changes — bumping `cycle` so a later
// re-entry generates a fresh dedupe key.
Object.defineProperty(exports, "__esModule", { value: true });
exports.STOCK_ALERT_ORDER = void 0;
exports.getStockStatus = getStockStatus;
exports.isStockTransition = isStockTransition;
function getStockStatus(stock, threshold) {
    if (stock <= 0)
        return 'OUT_OF_STOCK';
    if (stock <= threshold)
        return 'LOW_STOCK';
    return 'NORMAL';
}
function isStockTransition(prev, next) {
    return prev !== next;
}
// The alert supersedes the previous one (return-to-normal closes the alert).
exports.STOCK_ALERT_ORDER = ['NORMAL', 'LOW_STOCK', 'OUT_OF_STOCK'];
//# sourceMappingURL=stock.js.map