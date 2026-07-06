"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildCashMetrics = buildCashMetrics;
function buildCashMetrics(cash, context) {
    return [
        {
            label: 'Money to Collect',
            value: formatAmount(cash.outstanding),
            tone: cash.outstanding > 0 ? 'negative' : 'neutral',
            subtitle: cash.customerCount > 0 ? `Across ${cash.customerCount} customer${cash.customerCount === 1 ? '' : 's'}\nCollection is in progress` : undefined,
        },
        {
            label: 'Received Today',
            value: formatAmount(cash.collectedToday),
            tone: cash.collectedToday > 0 ? 'positive' : 'neutral',
        },
        {
            label: 'Expected Today',
            value: formatAmount(cash.expectedToday),
            tone: 'neutral',
            emptyLabel: cash.expectedToday === 0 ? "No payments expected today" : undefined,
        },
    ];
}
function formatAmount(amount) {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0,
    }).format(amount);
}
//# sourceMappingURL=buildCashMetrics.js.map